import { zodResolver } from '@hookform/resolvers/zod'
import { Box, Button, Callout, Flex, ScrollArea } from '@radix-ui/themes'
import { debounce } from 'lodash-es'
import { ChevronLeftIcon, InfoIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { FormProvider, useForm, useFormContext } from 'react-hook-form'
import type { z } from 'zod'

import { TestRuleSchema } from '@/schemas/generator'
import { useGeneratorStore } from '@/store/generator'
import { TestRule } from '@/types/rules'
import { exhaustive } from '@/utils/typescript'

import { StickyPanelHeader } from '../TestRuleContainer/StickyPanelHeader'
import { TestRuleInlineContent } from '../TestRuleContainer/TestRule/TestRuleInlineContent'
import { TestRuleTypeBadge } from '../TestRuleContainer/TestRule/TestRuleTypeBadge'

import { CorrelationEditor } from './CorrelationEditor'
import { CustomCodeEditor } from './CustomCodeEditor'
import { ParameterizationEditor } from './ParameterizationEditor/ParameterizationEditor'
import { VerificationEditor } from './VerificationEditor/VerificationEditor'

/**
 * How long the editor waits before writing a change to the generator. Long
 * enough that a burst of typing is one write, short enough that the request
 * list and script preview feel like they follow along.
 */
const STORE_WRITE_DEBOUNCE_MS = 300

export function RuleEditorSwitch() {
  const { watch } = useFormContext<TestRule>()
  const ruleType = watch('type')

  switch (ruleType) {
    case 'correlation':
      return <CorrelationEditor />
    case 'customCode':
      return <CustomCodeEditor />
    case 'parameterization':
      return <ParameterizationEditor />
    case 'verification':
      return <VerificationEditor />
    default:
      return exhaustive(ruleType)
  }
}

function RuleDisabledWarning() {
  return (
    <Callout.Root mb="4">
      <Callout.Icon>
        <InfoIcon />
      </Callout.Icon>
      <Callout.Text>This rule is currently disabled.</Callout.Text>
    </Callout.Root>
  )
}

interface RuleEditorProps {
  rule: TestRule
}

export function RuleEditor({ rule }: RuleEditorProps) {
  const setSelectedRuleId = useGeneratorStore(
    (state) => state.setSelectedRuleId
  )

  const updateRule = useGeneratorStore((state) => state.updateRule)

  const formMethods = useForm<
    z.input<typeof TestRuleSchema>,
    unknown,
    TestRule
  >({
    resolver: zodResolver(TestRuleSchema),
    defaultValues: rule,
    shouldFocusError: false,
  })

  const { watch, handleSubmit, reset } = formMethods

  const handleClose = () => {
    setSelectedRuleId(null)
  }

  const onSubmit = useCallback(
    (data: TestRule) => {
      updateRule(data)
    },
    [updateRule]
  )

  // The fields belong to react-hook-form, so they paint as fast as they are
  // typed into. What is debounced is the store write, which is what actually
  // costs: it re-applies every rule over the whole recording, regenerates the
  // script preview and updates the badge on every request row. Doing that per
  // keystroke made typing lag behind on a large recording.
  const submit = useRef(handleSubmit(onSubmit))
  submit.current = handleSubmit(onSubmit)

  const submitDebounced = useMemo(
    () => debounce(() => void submit.current(), STORE_WRITE_DEBOUNCE_MS),
    []
  )

  // Submit onChange
  useEffect(() => {
    const subscription = watch(() => submitDebounced())

    return () => {
      subscription.unsubscribe()
      // Flushed, not cancelled: closing the editor must not drop what was
      // typed in the last few hundred milliseconds.
      submitDebounced.flush()
    }
  }, [watch, submitDebounced])

  // Reset form when switching rules
  useEffect(() => {
    // The pending write still belongs to the rule being left, so it has to land
    // before the form is loaded with another one.
    submitDebounced.flush()
    reset(rule)
    // TODO: fix infinite loop when including all dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.id])

  return (
    <ScrollArea scrollbars="vertical">
      <FormProvider {...formMethods}>
        <StickyPanelHeader>
          <Flex align="center" gap="3" maxWidth="100%">
            <Button
              onClick={handleClose}
              variant="ghost"
              size="1"
              css={{ gap: 0 }}
            >
              <ChevronLeftIcon />
              Back
            </Button>
            <Flex align="center" gap="2" flexGrow="1" minWidth="0">
              <TestRuleTypeBadge rule={rule} />
              <TestRuleInlineContent rule={rule} />
            </Flex>
          </Flex>
        </StickyPanelHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Box p="2">
            {!rule.enabled && <RuleDisabledWarning />}
            <RuleEditorSwitch />
          </Box>
        </form>
      </FormProvider>
    </ScrollArea>
  )
}
