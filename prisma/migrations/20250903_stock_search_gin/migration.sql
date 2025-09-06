-- Add GIN and composite indexes for stock search optimization

DO $$
BEGIN
    -- GIN index for full-text search on ticker, symbol, description (case-insensitive, supports partial matches)
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'stock_search_gin_idx'
    ) THEN
        CREATE INDEX stock_search_gin_idx ON "Stock"
        USING GIN (
            to_tsvector('simple', coalesce("ticker",'') || ' ' || coalesce("symbol",'') || ' ' || coalesce("description",''))
        );
    END IF;

    -- Composite btree index for fast prefix/equality search
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'stock_search_composite_idx'
    ) THEN
        CREATE INDEX stock_search_composite_idx ON "Stock"("ticker", "symbol", "description");
    END IF;
END
$$;