import { component$ } from '@qwik.dev/core';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
}

export const StatCard = component$<StatCardProps>(
  ({ label, value, subtitle }) => {
    return (
      <div class="border-border bg-card-item-bg hover:bg-card-item-hover-bg flex items-center gap-4 rounded-xl border p-5 transition-all duration-200">
        <div class="flex-1">
          <div class="text-muted-foreground text-xs font-medium">{label}</div>
          <div class="mt-1 text-3xl font-semibold">{value}</div>
          {subtitle && (
            <div class="text-muted-foreground mt-1 text-xs">{subtitle}</div>
          )}
        </div>
      </div>
    );
  },
);
