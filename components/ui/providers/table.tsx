
'use client'
import {
  IndexTable,
  EmptyState,
  Card,
  InlineStack,
  Text,
  Button,
} from '@shopify/polaris'
import type { IndexTableProps } from '@shopify/polaris'

interface ReusableTableProps {
  title: string
  accentColor?: string
  linkLabel?: string
  linkUrl?: string
  resourceName: { singular: string; plural: string }
  headings: IndexTableProps['headings']
  itemCount: number
  children?: React.ReactNode
  emptyStateHeading: string
  emptyStateDescription: string
  emptyStateAction?: { content: string; url: string }
  selectable?: boolean
}

export default function ReusableTable({
  title,
  accentColor = 'bg-green-500',
  linkLabel,
  linkUrl,
  resourceName,
  headings,
  itemCount,
  children,
  emptyStateHeading,
  emptyStateDescription,
  emptyStateAction,
  selectable = false,
}: ReusableTableProps) {
  return (
    <Card padding="0">
      <div className="px-5 py-4 border-b border-gray-100">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <div className={\`w-1 h-5 rounded-full \${accentColor}\`} />
            <Text as="h2" variant="headingMd" fontWeight="semibold">
              {title}
            </Text>
          </InlineStack>
          {linkLabel && linkUrl && (
            <Button url={linkUrl} variant="plain">{linkLabel}</Button>
          )}
        </InlineStack>
      </div>
      <IndexTable
        resourceName={resourceName}
        itemCount={itemCount}
        headings={headings}
        selectable={selectable}
        emptyState={
          <EmptyState
            heading={emptyStateHeading}
            image=""
            action={emptyStateAction}
          >
            <p>{emptyStateDescription}</p>
          </EmptyState>
        }
      >
        {children}
      </IndexTable>
    </Card>
  )
}
