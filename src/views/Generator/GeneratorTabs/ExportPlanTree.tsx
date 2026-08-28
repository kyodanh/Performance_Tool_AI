import { css } from '@emotion/react'
import { Badge, Box, Callout, Flex, ScrollArea, Text } from '@radix-ui/themes'
import { ChevronRightIcon, TriangleAlertIcon } from 'lucide-react'

import { ExportPlan, PlannedRequest } from '@/codegen/export'
import { MethodBadge } from '@/components/MethodBadge'
import { ExportFormat } from '@/hooks/useExportPreview'
import { useGeneratorStore } from '@/store/generator'
import { formatTiming } from '@/utils/thinkTime'

import {
  LoadFields,
  RequestFields,
  TimeoutField,
  Value,
} from './ExportPlanTree.fields'

/** Node names differ per target, the structure does not. */
const LABELS = {
  jmeter: {
    root: 'Test Plan',
    load: 'Thread Group',
    defaults: 'HTTP Request Defaults',
    cookies: 'HTTP Cookie Manager',
    variables: 'User Defined Variables',
    dataFile: 'CSV Data Set Config',
    group: 'Transaction Controller',
    request: 'HTTP Request',
    headers: 'HTTP Header Manager',
    extractor: 'Post Processor',
    assertion: 'Response Assertion',
    timer: 'Constant Timer',
    rendezvous: 'Synchronizing Timer',
  },
  vugen: {
    root: 'Script',
    load: 'Runtime Settings',
    defaults: 'web_set_timeout',
    cookies: 'Cookie jar',
    variables: 'Parameters',
    dataFile: 'Parameter file',
    group: 'lr_start_transaction',
    request: 'web_custom_request',
    headers: 'web_add_header',
    extractor: 'web_reg_save_param_ex',
    assertion: 'web_reg_find',
    timer: 'lr_think_time',
    rendezvous: 'lr_rendezvous',
  },
} as const satisfies Record<ExportFormat, Record<string, string>>

const nodeStyles = css`
  summary {
    cursor: var(--cursor-button);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2);
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background-color: var(--gray-3);
  }

  > div {
    margin-left: var(--space-4);
    border-left: 1px solid var(--gray-4);
    padding-left: var(--space-2);
  }

  &[open] > summary svg:first-of-type {
    transform: rotate(90deg);
  }
`

interface NodeProps {
  type: string
  title?: React.ReactNode
  detail?: React.ReactNode
  defaultOpen?: boolean
  children?: React.ReactNode
}

function Node({ type, title, detail, defaultOpen, children }: NodeProps) {
  if (!children) {
    return (
      <Flex align="center" gap="2" px="2" py="1" pl="5">
        <Text size="1" weight="medium">
          {type}
        </Text>
        {title}
        {detail}
      </Flex>
    )
  }

  return (
    <details open={defaultOpen} css={nodeStyles}>
      <summary>
        <ChevronRightIcon size={14} />
        <Text size="1" weight="medium">
          {type}
        </Text>
        {title}
        {detail}
      </summary>
      <div>{children}</div>
    </details>
  )
}

interface RequestNodeProps {
  request: PlannedRequest
  labels: (typeof LABELS)[ExportFormat]
  editable: boolean
}

function RequestNode({ request, labels, editable }: RequestNodeProps) {
  return (
    <Node
      type={labels.request}
      title={<MethodBadge method={request.method}>{request.name}</MethodBadge>}
      detail={
        <Flex gap="1">
          {request.rendezvous && (
            <Badge color="amber" size="1">
              rendezvous
            </Badge>
          )}
          {request.thinkTime && (
            <Badge color="gray" size="1">
              {formatTiming(request.thinkTime)}
            </Badge>
          )}
        </Flex>
      }
    >
      <Node
        type={labels.headers}
        detail={<Value>{request.headers.length}</Value>}
      />
      {request.extractions.map((extraction) => (
        <Node
          key={extraction.variable}
          type={labels.extractor}
          detail={<Value>→ {extraction.variable}</Value>}
        />
      ))}
      {request.assertions.map((assertion, index) => (
        <Node
          key={index}
          type={labels.assertion}
          detail={
            <Value>
              {assertion.target} {assertion.negated ? 'not ' : ''}
              {assertion.operator} {String(assertion.value).slice(0, 60)}
            </Value>
          }
        />
      ))}
      {request.thinkTime && (
        <Node
          type={labels.timer}
          detail={<Value>{formatTiming(request.thinkTime)}</Value>}
        />
      )}
      {request.rendezvous && <Node type={labels.rendezvous} />}
      {editable && (
        <Box pl="5" py="1">
          <RequestFields
            requestKey={request.key}
            thinkTime={request.thinkTime}
            rendezvous={request.rendezvous}
          />
        </Box>
      )}
    </Node>
  )
}

interface ExportPlanTreeProps {
  plan: ExportPlan
  format: ExportFormat
  editable: boolean
}

export function ExportPlanTree({
  plan,
  format,
  editable,
}: ExportPlanTreeProps) {
  const labels = LABELS[format]
  const scriptName = useGeneratorStore((store) => store.scriptName)

  return (
    <ScrollArea scrollbars="both" css={{ flex: '1 1 0', minHeight: 0 }}>
      <Box p="2">
        {plan.warnings.length > 0 && (
          <Callout.Root color="amber" size="1" mb="2">
            <Callout.Icon>
              <TriangleAlertIcon size={14} />
            </Callout.Icon>
            <Callout.Text>
              {plan.warnings.map((warning) => (
                <Text as="p" key={warning} size="1">
                  {warning}
                </Text>
              ))}
            </Callout.Text>
          </Callout.Root>
        )}

        <Node
          type={labels.root}
          title={<Value>{scriptName}</Value>}
          defaultOpen
        >
          <Node
            type={labels.load}
            defaultOpen
            detail={<LoadFields editable={editable} />}
          />
          <Node
            type={labels.defaults}
            detail={<TimeoutField editable={editable} />}
          />
          <Node type={labels.cookies} />
          {plan.variables.length > 0 && (
            <Node
              type={labels.variables}
              detail={<Value>{plan.variables.length}</Value>}
            >
              {plan.variables.map((variable) => (
                <Node
                  key={variable.name}
                  type={variable.name}
                  detail={<Value>{variable.value}</Value>}
                />
              ))}
            </Node>
          )}
          {plan.dataFiles.map((file) => (
            <Node
              key={file}
              type={labels.dataFile}
              detail={<Value>{file}</Value>}
            />
          ))}
          {plan.groups.map((group) => (
            <Node
              key={group.name}
              type={labels.group}
              title={<Text size="1">{group.name}</Text>}
              detail={<Value>{group.requests.length} requests</Value>}
              defaultOpen={plan.groups.length === 1}
            >
              {group.requests.map((request) => (
                <RequestNode
                  key={request.id}
                  request={request}
                  labels={labels}
                  editable={editable}
                />
              ))}
            </Node>
          ))}
        </Node>
      </Box>
    </ScrollArea>
  )
}
