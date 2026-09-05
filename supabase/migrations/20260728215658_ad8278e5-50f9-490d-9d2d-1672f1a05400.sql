UPDATE public.skill_registry
SET department = 'ti'
WHERE (department IS NULL OR department = '')
  AND id IN (
    'cc82b192-a4c3-4b14-b26b-6ac82347e069',
    'e0ca8bcd-4568-4167-83c0-e30c9215f091',
    '4fbbca7a-3270-476d-9242-bad96e0a0f8f',
    'b47d0397-31c1-44b8-9ca4-1f585d3bd2a1',
    'bf266dc1-debd-4fcd-9e8a-922c3250ab1d',
    'f401fe34-ca8c-49ac-8067-113fb9a43c5d',
    'fadc23d2-00d7-46b5-8e4d-d4264cf56a06',
    '727052ed-ae74-4da4-a420-196bed81aca9',
    '5cbb724b-6572-449c-ae45-33f67abed37e',
    'ba876b6b-594f-45f2-ad89-184bafafb70b',
    '2f043b1f-c08d-48ef-b258-4e2d857f6fce',
    '890f33f0-66cb-4b16-8cbf-039dcba3ba3e',
    'fdb1da5b-9b60-4f07-b76c-677aa32cd2c4',
    '3927cb36-03d1-45dc-80d0-f131a6291bf6',
    '54eb5e12-05b5-44c6-8ef5-56e7859f4c05',
    '812d6315-a311-44d0-ac08-0e9038fc3ce7',
    '63737913-440d-4e14-840d-5274af7b927a',
    'b4dc1556-7190-43c2-a4ae-be62a670e764'
  );