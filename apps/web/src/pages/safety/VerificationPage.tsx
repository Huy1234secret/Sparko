import { useParams } from 'react-router-dom';
import { VerificationConfigSchema } from '@sparko/contracts';
import { Card, Field, Notice, PageHeading } from '@sparko/ui';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import {
  NumberField,
  RoleField,
  SelectField,
  fieldError,
} from '../../features/config/fields';

export function VerificationPage() {
  const { guildId = '' } = useParams();
  const controller = useFeatureConfig(guildId, 'R18', VerificationConfigSchema);
  const { form } = controller;
  return (
    <>
      <PageHeading
        eyebrow="Safety"
        title="Verification"
        description="Members accept your rules, meet optional age checks and can answer a simple challenge. Sparko then gives them a role."
      />
      <Notice tone="info" title="What verification does and does not do">
        It gives a role; it does not hide anything by itself. Decide what
        unverified members can see with Discord channel permissions. The
        arithmetic challenge slows down simple automated accounts but cannot
        stop a determined person.
      </Notice>
      <ConfigForm
        controller={controller.shell}
        title="Verification"
        description="Members verify from the server’s verification message or their member profile."
        enableLabel="Let members verify"
      >
        <Card>
          <h2>Rules members accept</h2>
          <Field
            label="Rules"
            htmlFor="verification-rules"
            required
            error={fieldError(form as never, 'rulesText')}
          >
            <textarea
              id="verification-rules"
              maxLength={4000}
              {...form.register('rulesText')}
            />
          </Field>
          <NumberField
            form={form}
            name="rulesVersion"
            label="Rules version"
            hint="Raise this number when the rules change. Members must accept the new version; anyone verifying against an older version is asked to read them again."
            min={1}
          />
        </Card>
        <Card>
          <h2>Checks and role</h2>
          <div className="form-grid">
            <RoleField
              form={form}
              name="roleId"
              label="Role for verified members"
              hint="Must be below Sparko’s role and have no moderator permissions."
              guildId={guildId}
              assigns
            />
            <SelectField
              form={form}
              name="challenge"
              label="Challenge"
              options={[
                { value: 'acknowledge', label: 'Accept the rules only' },
                {
                  value: 'arithmetic',
                  label: 'Accept the rules and answer a sum',
                },
              ]}
            />
            <NumberField
              form={form}
              name="minimumAccountAgeDays"
              label="Discord account at least"
              unit="days old"
              min={0}
              max={3650}
            />
            <NumberField
              form={form}
              name="minimumMemberAgeMinutes"
              label="In the server at least"
              unit="minutes"
              hint="Needs Sparko to have seen the member join (Server Members intent)."
              min={0}
              max={43200}
            />
          </div>
        </Card>
      </ConfigForm>
    </>
  );
}
