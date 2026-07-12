/**
 * Creator Payouts — visualização de pagamentos do marketplace de skills.
 * Somente leitura: o criador vê seus próprios ciclos de payout, valores acumulados e status.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, CheckCircle2, Clock, XCircle, Loader2, Receipt } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Payout = {
  id: string;
  creator_id: string;
  period_start: string;
  period_end: string;
  total_cents: number;
  status: "pending" | "processing" | "paid" | "failed";
  payout_method: string | null;
  payout_ref: string | null;
  created_at: string;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(s: Payout["status"]) {
  const map = {
    pending: { label: "Pendente", icon: Clock, className: "bg-muted text-muted-foreground" },
    processing: {
      label: "Processando",
      icon: Loader2,
      className: "bg-sky-500/15 text-sky-500 border-sky-500/30",
    },
    paid: {
      label: "Pago",
      icon: CheckCircle2,
      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    },
    failed: {
      label: "Falhou",
      icon: XCircle,
      className: "bg-destructive/15 text-destructive border-destructive/30",
    },
  } as const;
  const cfg = map[s];
  const Icon = cfg.icon;
  return (
    <Badge className={cfg.className}>
      <Icon className={`size-3 mr-1 ${s === "processing" ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  );
}

export default function CreatorPayoutsPage() {
  const { user } = useAuth();

  const { data: payouts, isLoading } = useQuery({
    queryKey: ["creator_payouts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_payouts")
        .select("*")
        .order("period_end", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payout[];
    },
  });

  const stats = useMemo(() => {
    const items = payouts ?? [];
    return {
      total: items.reduce((s, p) => s + p.total_cents, 0),
      paid: items.filter((p) => p.status === "paid").reduce((s, p) => s + p.total_cents, 0),
      pending: items
        .filter((p) => p.status === "pending" || p.status === "processing")
        .reduce((s, p) => s + p.total_cents, 0),
      count: items.length,
    };
  }, [payouts]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Payouts do Criador"
        description="Acompanhe os pagamentos gerados por vendas de skills e recursos do marketplace."
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ciclos</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats.count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total acumulado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatBRL(stats.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pago</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-500">
            {formatBRL(stats.paid)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">A receber</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-500">
            {formatBRL(stats.pending)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Wallet className="size-5 text-primary" />
          <CardTitle>Histórico de payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && (payouts?.length ?? 0) === 0 && (
            <Alert>
              <Receipt className="size-4" />
              <AlertTitle>Nenhum payout ainda</AlertTitle>
              <AlertDescription>
                Quando você tiver vendas de skills consolidadas, os pagamentos aparecerão aqui.
                Os ciclos são gerados automaticamente ao fim de cada período de apuração.
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && (payouts?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(p.period_start), "dd/MM/yy", { locale: ptBR })} —{" "}
                        {format(new Date(p.period_end), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-semibold">{formatBRL(p.total_cents)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.payout_method ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">
                        {p.payout_ref ?? "—"}
                      </TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd MMM yyyy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
