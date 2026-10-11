ALTER TABLE "TemplateVersion" ADD COLUMN "label" TEXT;
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_label_length"
  CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 100);
