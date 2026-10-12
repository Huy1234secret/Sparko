import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { ModulePage } from '../ModulePages';
import { LevelsPage } from './LevelsPage';
import { RankCardsPage } from './MemberPage';
import { CratesPage } from './CratesPage';
import { CountingPage } from './CountingPage';
import { GiveawaysPage } from './GiveawaysPage';
import {
  AutoRolesPage,
  LeaveBoostPage,
  StarboardPage,
  WelcomePage,
} from './CommunitySettingsPages';
import { RoleMenusPage } from './RoleMenusPage';
import { SubmissionsPage } from './SubmissionsPage';
import { ModerationPage } from '../safety/ModerationPage';
import { FormsPage } from '../safety/FormsPage';
import { ReportsPage } from '../safety/ReportsPage';
import { VerificationPage } from '../safety/VerificationPage';
import {
  AntiNukePage,
  AutomodPage,
  RaidGuardPage,
} from '../safety/ProtectionPages';
import { PollsPage } from '../automation/PollsPage';
import { EventsPage } from '../automation/EventsPage';
import { RemindersPage } from '../automation/RemindersPage';
import { BirthdaysPage } from '../automation/BirthdaysPage';
import { VoicePage } from '../automation/VoicePage';
import { InvitesPage } from '../automation/InvitesPage';
import { SchedulesPage } from '../automation/SchedulesPage';
import { RepliesPage } from '../automation/RepliesPage';
import { StickyPage } from '../automation/StickyPage';
import { WorkflowsPage } from '../automation/WorkflowsPage';
import { CommandsPage } from '../automation/CommandsPage';
import { BillingPage } from '../BillingPages';

/** Typed module pages; modules not listed here still use the generic page. */
const typedPages: Record<string, ComponentType> = {
  'engagement/levels': LevelsPage,
  'engagement/rank-cards': RankCardsPage,
  'engagement/crates': CratesPage,
  'engagement/counting': CountingPage,
  'engagement/giveaways': GiveawaysPage,
  'community/welcome': WelcomePage,
  'community/leave-boost': LeaveBoostPage,
  'community/roles': RoleMenusPage,
  'community/autoroles': AutoRolesPage,
  'community/suggestions': () => <SubmissionsPage kind="suggestions" />,
  'community/questions': () => <SubmissionsPage kind="questions" />,
  'community/starboard': StarboardPage,
  'safety/moderation': ModerationPage,
  'support/forms': FormsPage,
  'safety/reports': ReportsPage,
  'safety/verification': VerificationPage,
  'safety/automod': AutomodPage,
  'safety/raid-guard': RaidGuardPage,
  'safety/anti-nuke': AntiNukePage,
  'community/polls': PollsPage,
  'community/events': EventsPage,
  'community/birthdays': BirthdaysPage,
  'community/voice': VoicePage,
  'community/invites': InvitesPage,
  'automations/reminders': RemindersPage,
  'automations/schedules': SchedulesPage,
  'automations/replies': RepliesPage,
  'automations/sticky': StickyPage,
  'automations/workflows': WorkflowsPage,
  'automations/commands': CommandsPage,
  'settings/billing': BillingPage,
  'engagement/reward-roles': () => <LevelsPage defaultTab="rewards" />,
};
export function ModuleRouter() {
  const { group = '', module = '' } = useParams();
  const Typed = typedPages[`${group}/${module}`];
  return Typed ? <Typed /> : <ModulePage />;
}
