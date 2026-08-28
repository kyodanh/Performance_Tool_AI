/** Print stylesheet for the performance report. Kept inline so the PDF needs
 *  no external assets. */
export const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 11px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #16191d;
  }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #c9ced6; }
  h3 { font-size: 12px; margin: 14px 0 4px; }
  .page { padding: 0 0 8px; }
  .page + .page { break-before: page; }
  .cover { height: 90vh; display: flex; flex-direction: column; justify-content: center; }
  .cover .date { color: #5b6472; margin-bottom: 28px; }
  table { border-collapse: collapse; width: 100%; }
  table.definition th {
    text-align: left; width: 42%; font-weight: 600;
    padding: 3px 8px; border-bottom: 1px solid #e4e7ec; vertical-align: top;
  }
  table.definition td { padding: 3px 8px; border-bottom: 1px solid #e4e7ec; }
  table.data { font-size: 10px; }
  table.data th {
    text-align: left; background: #eef1f5; padding: 4px 6px;
    border: 1px solid #d3d8e0; font-weight: 600;
  }
  table.data td {
    padding: 3px 6px; border: 1px solid #e4e7ec;
    word-break: break-word; vertical-align: top;
  }
  table.data tbody tr:nth-child(even) { background: #f8f9fb; }
  tr, table.definition { break-inside: avoid; }
  .empty { color: #5b6472; font-style: italic; }
  .description { color: #3f4854; margin-top: 6px; }
  .chart { width: 100%; height: auto; break-inside: avoid; }
  .chart .grid { stroke: #e4e7ec; stroke-width: 1; }
  .chart .axis { stroke: #9aa2ae; stroke-width: 1; }
  .chart .tick { fill: #5b6472; font-size: 11px; }
  .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 0; margin: 4px 0 0; }
  .legend li { display: flex; align-items: center; gap: 5px; font-size: 10px; }
  .swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
`
