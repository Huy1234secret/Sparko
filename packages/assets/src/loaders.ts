export const animationLoaders = {
  spark: {
    light: () => import('../media/lottie/spark.light.json'),
    dark: () => import('../media/lottie/spark.dark.json'),
  },
  'setup-success': {
    light: () => import('../media/lottie/setup-success.light.json'),
    dark: () => import('../media/lottie/setup-success.dark.json'),
  },
  coin: {
    light: () => import('../media/lottie/coin.light.json'),
    dark: () => import('../media/lottie/coin.dark.json'),
  },
  trophy: {
    light: () => import('../media/lottie/trophy.light.json'),
    dark: () => import('../media/lottie/trophy.dark.json'),
  },
  ticket: {
    light: () => import('../media/lottie/ticket.light.json'),
    dark: () => import('../media/lottie/ticket.dark.json'),
  },
  shield: {
    light: () => import('../media/lottie/shield.light.json'),
    dark: () => import('../media/lottie/shield.dark.json'),
  },
  welcome: {
    light: () => import('../media/lottie/welcome.light.json'),
    dark: () => import('../media/lottie/welcome.dark.json'),
  },
  giveaway: {
    light: () => import('../media/lottie/giveaway.light.json'),
    dark: () => import('../media/lottie/giveaway.dark.json'),
  },
  calendar: {
    light: () => import('../media/lottie/calendar.light.json'),
    dark: () => import('../media/lottie/calendar.dark.json'),
  },
  chart: {
    light: () => import('../media/lottie/chart.light.json'),
    dark: () => import('../media/lottie/chart.dark.json'),
  },
  automation: {
    light: () => import('../media/lottie/automation.light.json'),
    dark: () => import('../media/lottie/automation.dark.json'),
  },
  settings: {
    light: () => import('../media/lottie/settings.light.json'),
    dark: () => import('../media/lottie/settings.dark.json'),
  },
  'empty-inbox': {
    light: () => import('../media/lottie/empty-inbox.light.json'),
    dark: () => import('../media/lottie/empty-inbox.dark.json'),
  },
  loading: {
    light: () => import('../media/lottie/loading.light.json'),
    dark: () => import('../media/lottie/loading.dark.json'),
  },
  'error-retry': {
    light: () => import('../media/lottie/error-retry.light.json'),
    dark: () => import('../media/lottie/error-retry.dark.json'),
  },
} as const;
