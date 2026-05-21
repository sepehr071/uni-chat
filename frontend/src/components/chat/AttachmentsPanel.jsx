import { useTranslation } from 'react-i18next'
import { Paperclip } from 'lucide-react'
import { useRailData } from '../../context/RailDataContext'
import { RailSection } from './_rail-helpers'

/**
 * Attachments tab body — file list for the active conversation.
 *
 * No props; reads from RailDataContext.
 */
export default function AttachmentsPanel() {
  const { t } = useTranslation('chat')
  const { attachments } = useRailData()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <RailSection
        title={t('contextRail.attached')}
        count={attachments.length || undefined}
      >
        {attachments.length > 0 ? (
          <div className="flex flex-col gap-1">
            {attachments.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background-tertiary"
              >
                <Paperclip className="h-3 w-3 text-foreground-tertiary flex-shrink-0" />
                <span className="text-xs text-foreground-secondary truncate">
                  {file.name || file.filename || t('contextRail.attachment')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-tertiary px-2 py-1">
            {t('contextRail.noFiles')}
          </p>
        )}
      </RailSection>
    </div>
  )
}
