-- 1. Выдаем базовые права (GRANT) роли anon на таблицы и последовательности
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON TABLE public.participants TO anon;
GRANT ALL ON TABLE public.trials TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 2. Выдаем те же права для авторизованных пользователей (на всякий случай)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON TABLE public.participants TO authenticated;
GRANT ALL ON TABLE public.trials TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 3. Отключаем RLS-блокировки для публичного исследования
ALTER TABLE public.participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trials DISABLE ROW LEVEL SECURITY;

-- 4. Создаем/обновляем RPC-функцию рандомизации групп
CREATE OR REPLACE FUNCTION public.claim_counterbalance_group()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  g1_count integer;
  g2_count integer;
BEGIN
  SELECT count(*) INTO g1_count FROM public.participants WHERE counterbalance_group = 1;
  SELECT count(*) INTO g2_count FROM public.participants WHERE counterbalance_group = 2;

  IF g1_count <= g2_count THEN
    RETURN 1;
  ELSE
    RETURN 2;
  END IF;
END;
$$;

-- 5. Разрешаем выполнение RPC-функции анонимным пользователям
GRANT EXECUTE ON FUNCTION public.claim_counterbalance_group() TO anon;
GRANT EXECUTE ON FUNCTION public.claim_counterbalance_group() TO authenticated;