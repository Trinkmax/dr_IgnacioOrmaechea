-- =============================================================================
-- Datos iniciales: proveedores tipo, tratamientos con estructura de costos y
-- gastos fijos habituales de un consultorio. Montos de referencia (oct-2026),
-- pensados para ajustarse desde la app.
-- =============================================================================

insert into public.suppliers (name, category, notes) values
  ('Clínica / Quirófano', 'Clínica y quirófano', 'Reemplazá por el nombre real del sanatorio o clínica.'),
  ('Anestesista', 'Honorarios médicos', 'Cargá el nombre y contacto del anestesista de confianza.'),
  ('Ayudante quirúrgico', 'Honorarios médicos', null),
  ('Instrumentadora', 'Honorarios médicos', null),
  ('Proveedor de implantes', 'Implantes', 'Implantes mamarios y glúteos.'),
  ('Droguería e insumos', 'Insumos', 'Compras de insumos, toxina, ácido hialurónico, hilos.');

insert into public.treatments (name, kind, duration_min, price, currency, color, description, sort_order) values
  ('Rinoplastia',                     'cirugia',       180, 5500,   'USD', 'rose',   'Cirugía de nariz. Incluye controles post-operatorios.', 10),
  ('Aumento mamario (implantes)',     'cirugia',       120, 6000,   'USD', 'plum',   'Mamoplastia de aumento con implantes.', 20),
  ('Mastopexia',                      'cirugia',       180, 6500,   'USD', 'violet', 'Levantamiento mamario.', 30),
  ('Reducción mamaria',               'cirugia',       210, 6500,   'USD', 'indigo', 'Mamoplastia de reducción con internación.', 40),
  ('Liposucción',                     'cirugia',       180, 5000,   'USD', 'amber',  'Lipoaspiración / lipoescultura.', 50),
  ('Dermolipectomía abdominal',       'cirugia',       240, 6500,   'USD', 'coral',  'Abdominoplastia ("dermo") con internación.', 60),
  ('Aumento de glúteos (implantes)',  'cirugia',       180, 6500,   'USD', 'sand',   'Gluteoplastia con implantes.', 70),
  ('Lipotransferencia glútea',        'cirugia',       240, 6000,   'USD', 'wine',   'Aumento de glúteos con grasa propia.', 80),
  ('Blefaroplastia',                  'cirugia',       120, 3200,   'USD', 'sky',    'Cirugía de párpados.', 90),
  ('Lifting facial',                  'cirugia',       300, 8500,   'USD', 'teal',   'Ritidoplastia con internación.', 100),
  ('Otoplastia',                      'cirugia',        90, 2800,   'USD', 'olive',  'Corrección de orejas.', 110),
  ('Bichectomía',                     'cirugia',        60, 1300,   'USD', 'stone',  'Extracción de bolsas de Bichat.', 120),
  ('Botox (toxina botulínica)',       'procedimiento',  30, 420000, 'ARS', 'sage',   'Tercio superior, hasta 3 zonas.', 200),
  ('Ácido hialurónico (1 ml)',        'procedimiento',  45, 380000, 'ARS', 'sky',    'Rellenos: labios, surcos, pómulos.', 210),
  ('Hilos tensores',                  'procedimiento',  60, 950000, 'ARS', 'violet', 'Hilos PDO para lifting sin cirugía.', 220),
  ('Plasma rico en plaquetas (PRP)',  'procedimiento',  45, 180000, 'ARS', 'coral',  'Bioestimulación facial o capilar.', 230),
  ('Consulta inicial',                'consulta',       30, 60000,  'ARS', 'slate',  'Primera consulta y evaluación.', 300),
  ('Control post-operatorio',         'consulta',       20, 0,      'ARS', 'stone',  'Controles incluidos en la cirugía.', 310);

-- Estructura de costos. Los ítems con proveedor generan cuentas por pagar
-- automáticamente cuando la cirugía se marca como atendida.
with costs (treatment, concept, amount, currency, supplier, ord) as (
  values
    ('Rinoplastia', 'Quirófano y clínica', 1600000, 'ARS', 'Clínica / Quirófano', 1),
    ('Rinoplastia', 'Anestesista', 650000, 'ARS', 'Anestesista', 2),
    ('Rinoplastia', 'Ayudante', 300000, 'ARS', 'Ayudante quirúrgico', 3),
    ('Rinoplastia', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 4),
    ('Rinoplastia', 'Insumos y medicación', 120000, 'ARS', null, 5),
    ('Rinoplastia', 'Férula y curaciones', 60000, 'ARS', null, 6),

    ('Aumento mamario (implantes)', 'Implantes mamarios', 1200, 'USD', 'Proveedor de implantes', 1),
    ('Aumento mamario (implantes)', 'Quirófano y clínica', 1500000, 'ARS', 'Clínica / Quirófano', 2),
    ('Aumento mamario (implantes)', 'Anestesista', 600000, 'ARS', 'Anestesista', 3),
    ('Aumento mamario (implantes)', 'Ayudante', 300000, 'ARS', 'Ayudante quirúrgico', 4),
    ('Aumento mamario (implantes)', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 5),
    ('Aumento mamario (implantes)', 'Insumos y medicación', 120000, 'ARS', null, 6),
    ('Aumento mamario (implantes)', 'Corpiño post-quirúrgico', 60000, 'ARS', null, 7),

    ('Mastopexia', 'Quirófano y clínica', 1700000, 'ARS', 'Clínica / Quirófano', 1),
    ('Mastopexia', 'Anestesista', 700000, 'ARS', 'Anestesista', 2),
    ('Mastopexia', 'Ayudante', 300000, 'ARS', 'Ayudante quirúrgico', 3),
    ('Mastopexia', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 4),
    ('Mastopexia', 'Insumos y medicación', 150000, 'ARS', null, 5),
    ('Mastopexia', 'Corpiño post-quirúrgico', 60000, 'ARS', null, 6),

    ('Reducción mamaria', 'Quirófano y clínica', 1900000, 'ARS', 'Clínica / Quirófano', 1),
    ('Reducción mamaria', 'Internación (1 noche)', 650000, 'ARS', 'Clínica / Quirófano', 2),
    ('Reducción mamaria', 'Anestesista', 750000, 'ARS', 'Anestesista', 3),
    ('Reducción mamaria', 'Ayudante', 350000, 'ARS', 'Ayudante quirúrgico', 4),
    ('Reducción mamaria', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 5),
    ('Reducción mamaria', 'Insumos y medicación', 150000, 'ARS', null, 6),
    ('Reducción mamaria', 'Corpiño post-quirúrgico', 60000, 'ARS', null, 7),

    ('Liposucción', 'Quirófano y clínica', 1800000, 'ARS', 'Clínica / Quirófano', 1),
    ('Liposucción', 'Anestesista', 700000, 'ARS', 'Anestesista', 2),
    ('Liposucción', 'Ayudante', 300000, 'ARS', 'Ayudante quirúrgico', 3),
    ('Liposucción', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 4),
    ('Liposucción', 'Cánulas, soluciones e insumos', 200000, 'ARS', null, 5),
    ('Liposucción', 'Faja post-quirúrgica', 120000, 'ARS', null, 6),

    ('Dermolipectomía abdominal', 'Quirófano y clínica', 2200000, 'ARS', 'Clínica / Quirófano', 1),
    ('Dermolipectomía abdominal', 'Internación (1 noche)', 650000, 'ARS', 'Clínica / Quirófano', 2),
    ('Dermolipectomía abdominal', 'Anestesista', 800000, 'ARS', 'Anestesista', 3),
    ('Dermolipectomía abdominal', 'Ayudante', 350000, 'ARS', 'Ayudante quirúrgico', 4),
    ('Dermolipectomía abdominal', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 5),
    ('Dermolipectomía abdominal', 'Insumos y medicación', 180000, 'ARS', null, 6),
    ('Dermolipectomía abdominal', 'Faja post-quirúrgica', 120000, 'ARS', null, 7),

    ('Aumento de glúteos (implantes)', 'Implantes glúteos', 1500, 'USD', 'Proveedor de implantes', 1),
    ('Aumento de glúteos (implantes)', 'Quirófano y clínica', 1800000, 'ARS', 'Clínica / Quirófano', 2),
    ('Aumento de glúteos (implantes)', 'Anestesista', 700000, 'ARS', 'Anestesista', 3),
    ('Aumento de glúteos (implantes)', 'Ayudante', 300000, 'ARS', 'Ayudante quirúrgico', 4),
    ('Aumento de glúteos (implantes)', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 5),
    ('Aumento de glúteos (implantes)', 'Insumos y medicación', 150000, 'ARS', null, 6),
    ('Aumento de glúteos (implantes)', 'Faja post-quirúrgica', 120000, 'ARS', null, 7),

    ('Lipotransferencia glútea', 'Quirófano y clínica', 2000000, 'ARS', 'Clínica / Quirófano', 1),
    ('Lipotransferencia glútea', 'Anestesista', 800000, 'ARS', 'Anestesista', 2),
    ('Lipotransferencia glútea', 'Ayudante', 350000, 'ARS', 'Ayudante quirúrgico', 3),
    ('Lipotransferencia glútea', 'Instrumentadora', 150000, 'ARS', 'Instrumentadora', 4),
    ('Lipotransferencia glútea', 'Cánulas, soluciones e insumos', 220000, 'ARS', null, 5),
    ('Lipotransferencia glútea', 'Faja post-quirúrgica', 120000, 'ARS', null, 6),

    ('Blefaroplastia', 'Quirófano y clínica', 900000, 'ARS', 'Clínica / Quirófano', 1),
    ('Blefaroplastia', 'Anestesista', 450000, 'ARS', 'Anestesista', 2),
    ('Blefaroplastia', 'Ayudante', 200000, 'ARS', 'Ayudante quirúrgico', 3),
    ('Blefaroplastia', 'Insumos y medicación', 80000, 'ARS', null, 4),

    ('Lifting facial', 'Quirófano y clínica', 2400000, 'ARS', 'Clínica / Quirófano', 1),
    ('Lifting facial', 'Internación (1 noche)', 650000, 'ARS', 'Clínica / Quirófano', 2),
    ('Lifting facial', 'Anestesista', 900000, 'ARS', 'Anestesista', 3),
    ('Lifting facial', 'Ayudante', 400000, 'ARS', 'Ayudante quirúrgico', 4),
    ('Lifting facial', 'Instrumentadora', 180000, 'ARS', 'Instrumentadora', 5),
    ('Lifting facial', 'Insumos y medicación', 200000, 'ARS', null, 6),

    ('Otoplastia', 'Quirófano y clínica', 800000, 'ARS', 'Clínica / Quirófano', 1),
    ('Otoplastia', 'Anestesista', 400000, 'ARS', 'Anestesista', 2),
    ('Otoplastia', 'Insumos y medicación', 70000, 'ARS', null, 3),
    ('Otoplastia', 'Vincha compresiva', 30000, 'ARS', null, 4),

    ('Bichectomía', 'Quirófano y clínica', 450000, 'ARS', 'Clínica / Quirófano', 1),
    ('Bichectomía', 'Anestesista', 250000, 'ARS', 'Anestesista', 2),
    ('Bichectomía', 'Insumos y medicación', 50000, 'ARS', null, 3),

    ('Botox (toxina botulínica)', 'Toxina botulínica (vial)', 190000, 'ARS', null, 1),
    ('Botox (toxina botulínica)', 'Jeringas y descartables', 12000, 'ARS', null, 2),

    ('Ácido hialurónico (1 ml)', 'Jeringa de ácido hialurónico', 165000, 'ARS', null, 1),
    ('Ácido hialurónico (1 ml)', 'Anestesia tópica y descartables', 15000, 'ARS', null, 2),

    ('Hilos tensores', 'Hilos PDO', 380000, 'ARS', null, 1),
    ('Hilos tensores', 'Anestesia y descartables', 20000, 'ARS', null, 2),

    ('Plasma rico en plaquetas (PRP)', 'Kit PRP', 45000, 'ARS', null, 1),
    ('Plasma rico en plaquetas (PRP)', 'Descartables', 10000, 'ARS', null, 2)
)
insert into public.treatment_costs (treatment_id, concept, amount, currency, supplier_id, sort_order)
select t.id, c.concept, c.amount, c.currency::public.currency_code, s.id, c.ord
from costs c
join public.treatments t on t.name = c.treatment
left join public.suppliers s on s.name = c.supplier;

insert into public.recurring_expenses (description, category, amount, currency, due_day, sort_order) values
  ('Alquiler del consultorio',      'Alquiler y expensas', 950000,  'ARS', 5,  10),
  ('Expensas',                      'Alquiler y expensas', 180000,  'ARS', 10, 20),
  ('Sueldo secretaria',             'Sueldos y cargas',    1100000, 'ARS', 5,  30),
  ('Cargas sociales',               'Sueldos y cargas',    330000,  'ARS', 10, 40),
  ('Luz, gas e internet',           'Servicios',           120000,  'ARS', 15, 50),
  ('Seguro de mala praxis',         'Seguros',             150000,  'ARS', 10, 60),
  ('Estudio contable',              'Honorarios',          200000,  'ARS', 10, 70),
  ('Marketing y redes sociales',    'Marketing',           400000,  'ARS', 1,  80),
  ('Software y suscripciones',      'Servicios',           60000,   'ARS', 1,  90),
  ('Impuestos (monotributo / IIBB)', 'Impuestos',          250000,  'ARS', 20, 100);
