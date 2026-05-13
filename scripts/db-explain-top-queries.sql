-- Script to explain top 20 most expensive queries
-- Use this to identify performance bottlenecks

SELECT 
    substring(query, 1, 100) AS short_query,
    calls,
    total_exec_time / 1000 AS total_seconds,
    min_exec_time,
    max_exec_time,
    mean_exec_time,
    stddev_exec_time,
    rows,
    100.0 * total_exec_time / sum(total_exec_time) OVER () AS percent_of_total
FROM 
    pg_stat_statements
ORDER BY 
    total_exec_time DESC
LIMIT 20;
