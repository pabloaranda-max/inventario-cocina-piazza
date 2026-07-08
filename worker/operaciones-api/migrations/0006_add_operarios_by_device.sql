-- 0006: atribución de conteos por operario (mini-slice R5.1)
-- countsByZone se guarda por clave "zona:deviceId" pero el nombre del operario
-- solo vivía en locks (expiran) y correcciones. Cada POST inv_sesion trae el
-- operario del dispositivo que envía: el Worker acumula {deviceId: {operario, at}}
-- para que admin pueda mostrar quién capturó qué, aun después del export.
ALTER TABLE inv_sesiones ADD COLUMN operarios_by_device TEXT NOT NULL DEFAULT '';
