CREATE INDEX orders_number_search ON orders(lower(order_number) text_pattern_ops);
CREATE INDEX orders_invoice_search ON orders(lower(invoice_number) text_pattern_ops);
CREATE INDEX order_revision_customer_search ON order_revisions(lower(snapshot->'input'->>'customerName') text_pattern_ops);
CREATE INDEX order_revision_phone_search ON order_revisions((regexp_replace(translate(snapshot->'input'->>'phone','໐໑໒໓໔໕໖໗໘໙','0123456789'),'[^0-9]','','g')) text_pattern_ops);
CREATE INDEX production_number_search ON production_sheets(lower(sheet_number) text_pattern_ops);
CREATE INDEX payment_number_search ON payment_entries(lower(number) text_pattern_ops);
CREATE INDEX shipment_number_search ON shipments(lower(number) text_pattern_ops);
CREATE INDEX shipment_tracking_search ON shipments(lower(tracking) text_pattern_ops);
