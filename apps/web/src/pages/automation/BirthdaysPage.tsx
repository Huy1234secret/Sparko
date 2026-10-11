import { useParams } from 'react-router-dom';
import { Card, Notice, PageHeading } from '@sparko/ui';
import {
  ChannelField,
  NumberField,
  RoleField,
} from '../../features/config/fields';
import { AutomationSettings } from '../../features/automation/shared';

export function BirthdaysPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Birthdays"
        description="Members add their own birthday. Sparko celebrates at their local time and respects their privacy choice."
      />
      <Notice tone="info" title="Members stay in control">
        Members add, change or remove their birthday from their member profile.
        Private birthdays only get a direct message; the announcement and role
        below are used only for members who choose to share. Removing a birthday
        also takes back a birthday role that is still active.
      </Notice>
      <AutomationSettings
        guildId={guildId}
        featureId="R38"
        title="Birthdays"
        description="Feb 29 birthdays follow each member’s own choice in non-leap years."
        enableLabel="Celebrate birthdays"
      >
        {(form) => (
          <Card>
            <h2>Celebration</h2>
            <div className="form-grid">
              <ChannelField
                form={form}
                name="channelId"
                label="Announce shared birthdays in"
                placeholder="Don’t announce"
                guildId={guildId}
              />
              <NumberField
                form={form}
                name="hour"
                label="Local hour to celebrate"
                hint="0–23, in each member’s own time zone."
                min={0}
                max={23}
              />
              <RoleField
                form={form}
                name="roleId"
                label="Birthday role"
                placeholder="No role"
                hint="Optional. Must be below Sparko’s role with no moderator permissions."
                guildId={guildId}
                assigns
              />
              <NumberField
                form={form}
                name="roleDurationHours"
                label="Keep the role for"
                unit="hours"
                min={1}
                max={72}
              />
            </div>
          </Card>
        )}
      </AutomationSettings>
    </>
  );
}
