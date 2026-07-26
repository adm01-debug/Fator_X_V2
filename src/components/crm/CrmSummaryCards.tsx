import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, Trophy, Target, TrendingUp } from 'lucide-react';
import { formatCurrency, type CrmSummary } from '@/services/crmService';

interface CrmSummaryCardsProps {
  summary: CrmSummary;
  isLoading?: boolean;
}

const CARD_BASE =
  'transition-all duration-200 hover:shadow-nexus-lg hover:border-primary/40 hover:-translate-y-0.5';

export function CrmSummaryCards({ summary, isLoading }: CrmSummaryCardsProps) {
  const items = [
    {
      label: 'Negócios abertos',
      value: String(summary.openCount),
      hint: formatCurrency(summary.openAmount),
      icon: Briefcase,
    },
    {
      label: 'Forecast ponderado',
      value: formatCurrency(summary.weightedForecast),
      hint: 'Valor × probabilidade do estágio',
      icon: TrendingUp,
    },
    {
      label: 'Ganhos',
      value: String(summary.wonCount),
      hint: formatCurrency(summary.wonAmount),
      icon: Trophy,
    },
    {
      label: 'Taxa de conversão',
      value: `${summary.winRate.toFixed(1)}%`,
      hint: `${summary.lostCount} perdidos`,
      icon: Target,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label} className={CARD_BASE}>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-muted-foreground">{item.label}</span>
              <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {isLoading ? '—' : item.value}
            </p>
            <p className="text-body-sm text-muted-foreground">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
