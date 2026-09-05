-- Linhas geradas no smoke test de roteamento de partições (verificado:
-- gravações caíram em traces_2026_07 / spans_2026_07 corretamente).
DELETE FROM public.traces WHERE root_name = 'smoke' AND source = 'test';
DELETE FROM public.spans  WHERE trace_id = 'smoke' AND span_id = 's1';