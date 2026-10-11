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
  'engagement/reward-roles': () => <LevelsPage defaultTab="rewards" />,
};
export function ModuleRouter() {
  const { group = '', module = '' } = useParams();
  const Typed = typedPages[`${group}/${module}`];
  return Typed ? <Typed /> : <ModulePage />;
}
