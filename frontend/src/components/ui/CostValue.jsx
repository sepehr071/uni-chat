export function CostValue({
  usd,
  fallback = '—',
  minDecimals = 2,
  maxDecimals = 4,
  className = '',
}) {
  if (usd == null || Number.isNaN(Number(usd))) {
    return <span className={className}>{fallback}</span>
  }
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  })
  return <span className={`tabular-nums ${className}`.trim()}>{fmt.format(Number(usd))}</span>
}

export default CostValue
