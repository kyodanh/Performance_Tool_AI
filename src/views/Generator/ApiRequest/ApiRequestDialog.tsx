import { zodResolver } from '@hookform/resolvers/zod'
import {
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  ScrollArea,
  Tabs,
  Text,
} from '@radix-ui/themes'
import { CircleAlertIcon, SendIcon } from 'lucide-react'
import { ClipboardEvent, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ComboBox } from '@/components/ComboBox'
import { ControlledSelect, FieldGroup } from '@/components/Form'
import { ReactMonacoEditor } from '@/components/Monaco/ReactMonacoEditor'
import { ResponseStatusBadge } from '@/components/ResponseStatusBadge'
import { useResponseDetailsTab } from '@/components/WebLogView/Details.hooks'
import { ResponseDetails } from '@/components/WebLogView/ResponseDetails'
import { DEFAULT_GROUP_NAME } from '@/constants'
import { useGeneratorStore } from '@/store/generator'
import { useToast } from '@/store/ui/useToast'
import { ProxyData } from '@/types'

import {
  ApiRequestFormData,
  ApiRequestSchema,
  DEFAULT_API_REQUEST,
  HTTP_METHODS,
  fromProxyData,
  hasBody,
  toProxyData,
  toSendOptions,
} from './ApiRequest.utils'
import { HeadersEditor } from './HeadersEditor'
import { parseCurl } from './parseCurl'
import {
  resolveRequestVariables,
  useRequestVariables,
} from './useCorrelationVariables'
import { useGroupNames } from './useGroupNames'
import { useVariableCompletion } from './useVariableCompletion'
import { VariableSuggestField } from './VariableSuggestField'

const METHOD_OPTIONS = HTTP_METHODS.map((method) => ({
  label: method,
  value: method,
}))

interface ApiRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // When set, the dialog edits this request instead of adding a new one.
  request?: ProxyData
  // Where to save the edited request, when it is not a manual one.
  onSave?: (request: ProxyData) => void
}

export function ApiRequestDialog({
  open,
  onOpenChange,
  request,
  onSave,
}: ApiRequestDialogProps) {
  const isEditing = request !== undefined
  const groupNames = useGroupNames()
  // The first group in the script, which is not called "Default group" once it
  // has been renamed.
  const defaultGroup = groupNames[0] ?? DEFAULT_API_REQUEST.group
  const defaultValues = useMemo(
    () =>
      request
        ? fromProxyData(request)
        : { ...DEFAULT_API_REQUEST, group: defaultGroup },
    [request, defaultGroup]
  )
  const addManualRequest = useGeneratorStore((store) => store.addManualRequest)
  const updateManualRequest = useGeneratorStore(
    (store) => store.updateManualRequest
  )
  const setResponseTab = useResponseDetailsTab((store) => store.setTab)
  const showToast = useToast()

  const [sent, setSent] = useState<ProxyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const variables = useRequestVariables()
  const variableNames = Object.keys(variables)
  const handleBodyEditorMount = useVariableCompletion(variableNames)

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors, isValid },
  } = useForm<ApiRequestFormData>({
    resolver: zodResolver(ApiRequestSchema),
    defaultValues,
    // Sending is optional, so the form has to say whether it can be added
    // before anything is submitted.
    mode: 'onTouched',
  })

  const method = watch('method')
  const headerCount = watch('headers').filter(
    ({ name }) => name.trim() !== ''
  ).length
  const hasContent = watch('content').trim() !== ''

  // A response only describes the request that was sent, so editing the form
  // invalidates it. The group is not part of the request, so picking one keeps
  // the response, and the sent request picks the group up on its way in.
  useEffect(() => {
    const subscription = watch((_, { name }) => {
      if (name === 'group') {
        return
      }

      setSent(null)
      setError(null)
    })

    return () => subscription.unsubscribe()
  }, [watch])

  const handleSend = handleSubmit(async (data) => {
    setIsSending(true)
    setSent(null)
    setError(null)

    // Resolved on send, not on render: reading the data files is async.
    const result = await window.studio.httpRequest.send(
      toSendOptions(
        data,
        await resolveRequestVariables(useGeneratorStore.getState())
      )
    )

    setIsSending(false)

    if (result.type === 'error') {
      setError(result.message)
      return
    }

    setSent(toProxyData(data, result.response, request?.id))
    // The body is what you check after sending, so open it instead of headers.
    setResponseTab('content')
  })

  // Pasting a curl command in the URL field fills the whole request.
  function handleUrlPaste(event: ClipboardEvent<HTMLInputElement>) {
    const parsed = parseCurl(event.clipboardData.getData('text'))

    if (parsed === null) {
      return
    }

    event.preventDefault()
    reset({ ...parsed, group: getValues('group') })
    showToast({ title: 'cURL command imported', status: 'success' })
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      reset(defaultValues)
      setSent(null)
      setError(null)
    }

    onOpenChange(open)
  }

  // Sending only checks the request, so a request that was never sent can be
  // added too, it just carries no response.
  const handleAddToScript = handleSubmit((data) => {
    const proxyData = toProxyData(data, sent?.response, request?.id)

    if (onSave) {
      onSave(proxyData)
    } else if (isEditing) {
      updateManualRequest(proxyData.id, proxyData)
    } else {
      addManualRequest(proxyData)
    }

    showToast({
      title: isEditing ? 'Request updated' : 'Request added to the script',
      status: 'success',
    })
    handleOpenChange(false)
  })

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content maxWidth="900px">
        <Dialog.Title>
          {isEditing ? 'Edit request' : 'Add request'}
        </Dialog.Title>
        <Dialog.Description size="2" mb="4" color="gray">
          {isEditing
            ? 'Send the request again to save your changes.'
            : 'Send the request to check it works, or add it to the script right away.'}
        </Dialog.Description>

        <form onSubmit={handleSend}>
          <Flex gap="2" align="start">
            <Box width="120px" flexShrink="0">
              <ControlledSelect
                name="method"
                control={control}
                options={METHOD_OPTIONS}
              />
            </Box>
            <Box flexGrow="1">
              <FieldGroup errors={errors} name="url" mb="0">
                <VariableSuggestField
                  placeholder="https://example.com/api/users or paste a cURL command"
                  aria-label="URL"
                  names={variableNames}
                  onInsert={(value) =>
                    setValue('url', value, { shouldDirty: true })
                  }
                  {...register('url')}
                  onPaste={handleUrlPaste}
                />
              </FieldGroup>
            </Box>
            <Button type="submit" loading={isSending}>
              <SendIcon />
              Send
            </Button>
          </Flex>

          <Flex gap="2" align="center" mt="2">
            <Text size="1" color="gray" as="label" htmlFor="api-request-group">
              Group
            </Text>
            <Box width="240px">
              <Controller
                control={control}
                name="group"
                render={({ field: { value, onChange, onBlur } }) => (
                  <ComboBox
                    id="api-request-group"
                    value={value}
                    placeholder={DEFAULT_GROUP_NAME}
                    options={groupNames.map((name) => ({
                      label: name,
                      value: name,
                    }))}
                    onChange={onChange}
                    onBlur={onBlur}
                    portalMenu={false}
                  />
                )}
              />
            </Box>
            <Text size="1" color="gray">
              Requests in the same group run inside one <code>group()</code> in
              the script.
            </Text>
          </Flex>

          <Tabs.Root defaultValue="headers" mt="4">
            <Tabs.List>
              <Tabs.Trigger value="headers">
                Headers
                {headerCount > 0 && (
                  <Text size="1" color="gray" ml="1">
                    {headerCount}
                  </Text>
                )}
              </Tabs.Trigger>
              <Tabs.Trigger value="body" disabled={!hasBody(method)}>
                Body
                {hasContent && hasBody(method) && (
                  <Text size="1" color="green" ml="1">
                    &bull;
                  </Text>
                )}
              </Tabs.Trigger>
            </Tabs.List>
            <Box pt="3">
              <Tabs.Content value="headers">
                <HeadersEditor
                  control={control}
                  register={register}
                  setValue={setValue}
                  variableNames={variableNames}
                />
              </Tabs.Content>
              <Tabs.Content value="body">
                <Box
                  height="200px"
                  css={{ border: '1px solid var(--gray-5)' }}
                  aria-label="Body"
                >
                  <Controller
                    name="content"
                    control={control}
                    render={({ field }) => (
                      <ReactMonacoEditor
                        showToolbar
                        defaultLanguage="json"
                        value={field.value}
                        onChange={(value = '') => field.onChange(value)}
                        onMount={handleBodyEditorMount}
                        // A `{variable}` lives inside a JSON string, where
                        // Monaco keeps quick suggestions off by default.
                        options={{
                          quickSuggestions: {
                            other: true,
                            comments: false,
                            strings: true,
                          },
                        }}
                      />
                    )}
                  />
                </Box>
              </Tabs.Content>
            </Box>
          </Tabs.Root>
        </form>

        {error !== null && (
          <Callout.Root color="red" mt="4" role="alert">
            <Callout.Icon>
              <CircleAlertIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {sent?.response && (
          <Box mt="4">
            <Flex gap="4" align="center" mb="2">
              <ResponseStatusBadge status={sent.response.statusCode}>
                {sent.response.statusCode} {sent.response.reason}
              </ResponseStatusBadge>
              <Text size="1" color="gray">
                {Math.round(
                  (sent.response.timestampEnd - sent.response.timestampStart) *
                    1000
                )}{' '}
                ms
              </Text>
              <Text size="1" color="gray">
                {sent.response.contentLength} B
              </Text>
            </Flex>
            <Box height="280px" css={{ border: '1px solid var(--gray-5)' }}>
              <ScrollArea>
                <ResponseDetails data={sent} />
              </ScrollArea>
            </Box>
          </Box>
        )}

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button disabled={!isValid} onClick={handleAddToScript}>
            {isEditing ? 'Save changes' : 'Add to script'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
