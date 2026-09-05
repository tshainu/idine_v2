declare module "onedollarstats/expo" {
  import type { ComponentType, ReactNode } from "react";

  export type ExpoAnalyticsConfig = Record<string, unknown>;

  export const OneDollarStatsProvider: ComponentType<{
    children?: ReactNode;
    config?: ExpoAnalyticsConfig;
    [key: string]: unknown;
  }>;

  export function useAnalytics(): {
    track: (event: string, properties?: Record<string, unknown>) => void;
  };
}
