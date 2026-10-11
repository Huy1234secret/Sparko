import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { ModulePage } from '../ModulePages';
import { LevelsPage } from './LevelsPage';
import { RankCardsPage } from './MemberPage';
import { CratesPage } from './CratesPage';
import { CountingPage } from './CountingPage';
import { GiveawaysPage } from './GiveawaysPage';

/** Typed module pages; modules not listed here still use the generic page. */
const typedPages: Record<string, ComponentType> = {
  'engagement/levels': LevelsPage,
  'engagement/rank-cards': RankCardsPage,
  'engagement/crates': CratesPage,
  'engagement/counting': CountingPage,
  'engagement/giveaways': GiveawaysPage,
  'engagement/reward-roles': () => <LevelsPage defaultTab="rewards" />,
};
export function ModuleRouter() {
  const { group = '', module = '' } = useParams();
  const Typed = typedPages[`${group}/${module}`];
  return Typed ? <Typed /> : <ModulePage />;
}
