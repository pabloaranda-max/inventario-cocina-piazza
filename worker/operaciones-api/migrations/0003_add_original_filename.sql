-- 0003: nombre original del archivo Xetux de la plantilla (Slice R2, spec v4.7 §8)
-- Xetux puede rechazar la importación si el archivo no conserva el nombre con que
-- fue exportado. Se captura de file.name al subir la plantilla en admin.html.
ALTER TABLE inv_plantillas ADD COLUMN original_filename TEXT NOT NULL DEFAULT '';
