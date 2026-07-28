ALTER TABLE public.skill_registry DROP CONSTRAINT IF EXISTS skill_registry_department_source_valid;
ALTER TABLE public.skill_registry ADD CONSTRAINT skill_registry_department_source_valid
  CHECK (department_source = ANY (ARRAY['unknown','heuristic','platform_heuristic','llm','human','import']));

UPDATE public.skill_registry AS s SET department = v.dep, department_confidence = v.conf, department_source = v.src, updated_at = now() FROM (VALUES
('97afd497-ee20-480c-bde4-889f7a99a98a'::uuid,'ti',0.229,'heuristic'),
('1ec2902a-f1dc-44f9-9e65-b028d456756e'::uuid,'ti',0.218,'heuristic'),
('e7989ec1-2d6c-45d2-b34b-5b96473019e8'::uuid,'ti',0.15,'platform_heuristic'),
('f5093907-e745-4c6a-aec2-8dd79fe5dbb3'::uuid,'ti',0.15,'platform_heuristic'),
('b06ded41-be50-41b8-82e1-edd67cbb6b29'::uuid,'ti',0.15,'platform_heuristic'),
('a8efbfb0-557b-4092-a224-82c031965e55'::uuid,'ti',0.15,'platform_heuristic'),
('4264f979-664c-4e03-97e9-79826ad1d288'::uuid,'ti',0.15,'platform_heuristic'),
('df69cf26-67b5-4e35-9491-e75c935eb7dc'::uuid,'ti',0.071,'heuristic'),
('b57fc2fe-8e82-4aae-a1be-b57f6b4f76ee'::uuid,'ti',0.294,'heuristic'),
('2c557628-1bf6-416b-8380-94e44933d0fd'::uuid,'ti',0.199,'heuristic'),
('8b1195bd-b15b-486c-840c-bd88e032bcaf'::uuid,'ti',0.15,'platform_heuristic'),
('be7cc846-7131-4ced-98ad-1613456c215c'::uuid,'ti',0.15,'platform_heuristic'),
('5655a079-81c1-40c5-bbd5-80ed2ff87cee'::uuid,'ti',0.183,'heuristic'),
('49634ccd-f401-4467-a248-5ae7bb3174a7'::uuid,'ti',0.15,'platform_heuristic'),
('36e49b46-87ce-48af-8308-b3af131e3e80'::uuid,'ti',0.15,'platform_heuristic'),
('ee61e1e9-cc21-460d-bb61-9bee7516d20a'::uuid,'ti',0.15,'platform_heuristic'),
('ca05eeb1-e19b-4cfb-b949-3a02d6d43a67'::uuid,'ti',0.208,'heuristic'),
('c20bede5-9e55-47c0-baae-054593dd8b3d'::uuid,'ti',0.15,'platform_heuristic'),
('5c42af71-40bb-48d9-b120-6c5552c9575d'::uuid,'ti',0.241,'heuristic'),
('2201aa76-7e9e-4b5e-a736-3a9e08dab3bb'::uuid,'ti',0.15,'platform_heuristic'),
('517cacf0-cd36-4445-ab9b-b361bffb5520'::uuid,'ti',0.138,'heuristic')
) AS v(id, dep, conf, src) WHERE s.id = v.id AND (s.department IS NULL OR s.department = '');