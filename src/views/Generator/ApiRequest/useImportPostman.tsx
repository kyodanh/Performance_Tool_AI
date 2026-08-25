import { ChangeEvent, useRef } from 'react'

import { useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'

import { toProxyData } from './ApiRequest.utils'
import {
  PostmanImport,
  PostmanVariables,
  parsePostman,
  parsePostmanEnvironment,
} from './parsePostman'

/**
 * The file picker behind "Import Postman". `fileInput` has to be rendered once
 * by the caller, which lets a button and a menu item share one picker.
 */
export function useImportPostman() {
  const inputRef = useRef<HTMLInputElement>(null)
  const addManualRequest = useGeneratorStore((store) => store.addManualRequest)
  const showToast = useToast()

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    // Cleared so picking the same file again still fires `change`.
    event.target.value = ''

    if (files.length === 0) {
      return
    }

    const contents = await Promise.all(files.map((file) => file.text()))

    // An environment holds the `{{variables}}` a collection leaves undefined,
    // so both can be picked at once and the collections resolve against it.
    const environment = contents.reduce<PostmanVariables>(
      (result, content) => ({ ...result, ...parsePostmanEnvironment(content) }),
      {}
    )

    const imports = contents
      .map((content) => parsePostman(content, environment))
      .filter((result): result is PostmanImport => result !== null)

    if (imports.length === 0) {
      showToast({
        title: 'Could not import collection',
        description:
          'Select a Postman collection export (schema v2.x), optionally together with an environment export.',
        status: 'error',
      })
      return
    }

    const requests = imports.flatMap((result) => result.requests)
    const skipped = imports.reduce((total, result) => total + result.skipped, 0)

    for (const request of requests) {
      addManualRequest(toProxyData(request))
    }

    if (requests.length === 0) {
      showToast({
        title: 'No requests imported',
        description: skippedDescription(skipped),
        status: 'error',
      })
      return
    }

    showToast({
      title: `Imported ${count(requests.length, 'request')}`,
      description: skipped > 0 ? skippedDescription(skipped) : undefined,
      status: 'success',
    })
  }

  return {
    importPostman: () => inputRef.current?.click(),
    fileInput: (
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={handleChange}
      />
    ),
  }
}

function skippedDescription(skipped: number) {
  return `${count(skipped, 'request')} skipped: undefined {{variables}}, an unsupported method, or a body we cannot reproduce. Select the matching environment file too if variables are missing.`
}

function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}
