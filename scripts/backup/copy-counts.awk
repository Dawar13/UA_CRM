# Prints "<table> <rows>" for every COPY block of a pg_dump data file (text format: one line per
# record, the block ends with a line holding only "\.").
/^COPY / { table = $2; rows = 0; inside = 1; next }
inside && /^\\\.$/ { print table, rows; inside = 0; next }
inside { rows++ }
