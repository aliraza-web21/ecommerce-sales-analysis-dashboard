(() => {
  const $ = (id) => document.getElementById(id);
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  const number = n => new Intl.NumberFormat('en-US').format(n || 0);
  const palette = ['#635bff','#23a783','#f1a448','#e36b7c','#4b9be8','#8e71d5'];
  const products = [
    ['Wireless Headphones','Electronics',89,31], ['Running Shoes','Fashion',115,38], ['Coffee Maker','Home & Kitchen',74,22],
    ['Smart Watch','Electronics',159,49], ['Backpack','Fashion',58,20], ['Desk Lamp','Home & Kitchen',42,13],
    ['Bluetooth Speaker','Electronics',69,24], ['Yoga Mat','Sports',32,12], ['Water Bottle','Sports',24,9],
    ['Skin Care Set','Beauty',47,17], ['Travel Mug','Home & Kitchen',29,10], ['Training Jacket','Fashion',82,27]
  ];
  const regions = ['North America','Europe','Asia Pacific','Middle East'];
  const statuses = ['Paid','Paid','Paid','Pending','Paid','Refunded'];
  let allOrders = [];
  let filteredOrders = [];
  let currentPage = 1;
  const pageSize = 8;
  let customData = false;
  let charts = {};

  // Deterministic demo data, so the dashboard is consistent on every refresh.
  function buildDemoData() {
    const out = [];
    const start = new Date('2026-01-01T12:00:00');
    for (let i = 0; i < 120; i++) {
      const p = products[(i * 7 + Math.floor(i / 4)) % products.length];
      const date = new Date(start);
      date.setDate(start.getDate() + ((i * 11 + Math.floor(i / 3)) % 300));
      const quantity = 1 + ((i * 3 + Math.floor(i / 7)) % 5);
      const discount = (i % 7 === 0) ? 0.15 : (i % 5 === 0 ? 0.08 : 0);
      const revenue = +(p[2] * quantity * (1 - discount)).toFixed(2);
      const profit = +(p[3] * quantity * (1 - discount) - (i % 9 === 0 ? 8 : 0)).toFixed(2);
      out.push({
        orderId: 'ORD-' + String(1001 + i), product: p[0], category: p[1],
        date: date.toISOString().slice(0,10), region: regions[(i * 5 + Math.floor(i / 6)) % regions.length],
        quantity, revenue, profit, status: statuses[(i * 5 + Math.floor(i / 8)) % statuses.length],
        customer: 'Customer ' + String(101 + ((i * 13) % 89))
      });
    }
    return out.sort((a,b) => b.date.localeCompare(a.date));
  }

  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i+1];
      if (c === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && next === '\n') i++;
        row.push(cell.trim()); if (row.some(v => v !== '')) rows.push(row);
        row = []; cell = '';
      } else cell += c;
    }
    if (cell.length || row.length) { row.push(cell.trim()); if (row.some(v => v !== '')) rows.push(row); }
    if (rows.length < 2) throw new Error('The CSV file is empty or has no data rows.');
    const headers = rows.shift().map(h => h.toLowerCase().replace(/[\s-]+/g,'_'));
    const find = names => headers.findIndex(h => names.includes(h));
    const ix = {
      order: find(['order_id','orderid','id']), product: find(['product','product_name','item','item_name']),
      category: find(['category','product_category']), date: find(['date','order_date','purchase_date']),
      region: find(['region','country','state','market']), quantity: find(['quantity','qty','units','units_sold']),
      revenue: find(['revenue','sales','total','total_sales','amount']), profit: find(['profit','net_profit']),
      price: find(['price','unit_price','selling_price']), status: find(['status','order_status']),
      customer: find(['customer','customer_name','buyer'])
    };
    if (ix.product < 0 || ix.date < 0 || (ix.revenue < 0 && (ix.price < 0 || ix.quantity < 0))) {
      throw new Error('CSV needs product, date, and revenue/sales OR price + quantity columns. See the README notes.');
    }
    const parsed = rows.map((r,i) => {
      const val = j => j >= 0 ? (r[j] || '') : '';
      const num = j => Number(String(val(j)).replace(/[$,\s]/g,'')) || 0;
      const rawDate = val(ix.date);
      const d = new Date(rawDate);
      if (!rawDate || Number.isNaN(d.getTime())) return null;
      const quantity = ix.quantity >= 0 ? num(ix.quantity) : 1;
      const revenue = ix.revenue >= 0 ? num(ix.revenue) : num(ix.price) * quantity;
      return {
        orderId: val(ix.order) || `CSV-${i+1}`, product: val(ix.product) || 'Unknown product',
        category: (ix.category >= 0 ? val(ix.category) : '') || 'Uncategorised',
        date: d.toISOString().slice(0,10), region: (ix.region >= 0 ? val(ix.region) : '') || 'Unspecified',
        quantity, revenue, profit: ix.profit >= 0 ? num(ix.profit) : 0,
        status: (ix.status >= 0 ? val(ix.status) : '') || 'Paid',
        customer: (ix.customer >= 0 ? val(ix.customer) : '') || '—'
      };
    }).filter(Boolean);
    if (!parsed.length) throw new Error('No valid date rows found. Use dates like 2026-05-21.');
    return parsed.sort((a,b) => b.date.localeCompare(a.date));
  }

  function populateFilters() {
    const fill = (id, values, label) => {
      const select = $(id), previous = select.value;
      select.innerHTML = `<option value="all">All ${label}</option>` + [...new Set(values)].sort().map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
      if ([...select.options].some(o => o.value === previous)) select.value = previous;
    };
    fill('categoryFilter', allOrders.map(o => o.category), 'categories');
    fill('regionFilter', allOrders.map(o => o.region), 'regions');
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function getFiltered() {
    const period = $('dateFilter').value, category = $('categoryFilter').value, region = $('regionFilter').value;
    let rows = [...allOrders];
    if (period !== 'all') {
      const newest = new Date(Math.max(...rows.map(o => new Date(o.date).getTime())));
      const cutoff = new Date(newest); cutoff.setDate(cutoff.getDate() - Number(period));
      rows = rows.filter(o => new Date(o.date) >= cutoff);
    }
    if (category !== 'all') rows = rows.filter(o => o.category === category);
    if (region !== 'all') rows = rows.filter(o => o.region === region);
    return rows;
  }
  function aggregate(rows, key, metric='revenue') {
    const result = {};
    rows.forEach(o => { result[o[key]] = (result[o[key]] || 0) + (Number(o[metric]) || 0); });
    return result;
  }
  function chartBaseOptions() {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor:'#172033', padding:10, titleFont:{size:11}, bodyFont:{size:11}, displayColors:false } },
      scales: {
        x: { grid: { display:false }, ticks: { color:'#8790a4', font:{size:10}, maxRotation:0, autoSkip:true }, border:{display:false} },
        y: { grid: { color:'#eef1f6', drawBorder:false }, ticks: { color:'#8790a4', font:{size:10}, callback: v => '$' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'k' : v) }, border:{display:false} }
      }
    };
  }
  function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
  function makeChart(id, config) {
    destroyChart(id);
    const canvas = $(id);
    if (!canvas || !window.Chart) return;
    charts[id] = new Chart(canvas, config);
  }
  function renderCharts(rows) {
    const group = $('trendGrouping').value;
    const byTime = {};
    rows.forEach(o => {
      const d = new Date(o.date + 'T12:00:00');
      let key;
      if (group === 'week') {
        const day = d.getDay(); d.setDate(d.getDate() - ((day + 6) % 7));
        key = d.toISOString().slice(0,10);
      } else key = o.date.slice(0,7);
      byTime[key] = (byTime[key] || 0) + o.revenue;
    });
    const timeKeys = Object.keys(byTime).sort();
    const timeLabels = timeKeys.map(k => group === 'week' ? new Date(k+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : new Date(k+'-15T12:00:00').toLocaleDateString('en-US',{month:'short',year:'2-digit'}));
    const base = chartBaseOptions();
    makeChart('revenueChart', { type:'line', data:{ labels:timeLabels, datasets:[{data:timeKeys.map(k=>byTime[k]), borderColor:'#635bff', backgroundColor:'rgba(99,91,255,.10)', fill:true, tension:.35, borderWidth:2.5, pointRadius:2.5, pointHoverRadius:5}] }, options:{...base, interaction:{intersect:false,mode:'index'}, scales:{...base.scales, y:{...base.scales.y, beginAtZero:true}}} });

    const cat = aggregate(rows,'category');
    makeChart('categoryChart', { type:'doughnut', data:{labels:Object.keys(cat),datasets:[{data:Object.values(cat),backgroundColor:palette,borderWidth:0,hoverOffset:5}]}, options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,padding:14,color:'#707a90',font:{size:10}}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${money(ctx.raw)}`}}} } });

    const prod = aggregate(rows,'product');
    const top = Object.entries(prod).sort((a,b)=>b[1]-a[1]).slice(0,5);
    makeChart('productsChart', { type:'bar', data:{labels:top.map(x=>x[0]),datasets:[{data:top.map(x=>x[1]),backgroundColor:palette[0],borderRadius:6,barThickness:19}]}, options:{...base,indexAxis:'y',scales:{x:{...base.scales.x,beginAtZero:true,ticks:{...base.scales.x.ticks,callback:v=>'$'+(v>=1000?(v/1000).toFixed(1)+'k':v)}},y:{...base.scales.y,grid:{display:false},ticks:{...base.scales.y.ticks,font:{size:10}}}}} });

    const rev = aggregate(rows,'category','revenue'), prof = aggregate(rows,'category','profit');
    const labels = Object.keys(rev).sort((a,b)=>rev[b]-rev[a]);
    makeChart('profitChart', {type:'bar',data:{labels,datasets:[{label:'Revenue',data:labels.map(k=>rev[k]),backgroundColor:'#635bff',borderRadius:5},{label:'Profit',data:labels.map(k=>prof[k]),backgroundColor:'#27ae88',borderRadius:5}]},options:{...base,plugins:{...base.plugins,legend:{display:true,position:'top',align:'end',labels:{usePointStyle:true,boxWidth:7,color:'#707a90',font:{size:10}}}},scales:{...base.scales,x:{...base.scales.x,ticks:{...base.scales.x.ticks,maxRotation:20}},y:{...base.scales.y,beginAtZero:true}}} });
  }
  function renderInsights(rows) {
    const box = $('insightList');
    if (!rows.length) { box.innerHTML = '<div class="empty">No data for these filters.</div>'; return; }
    const catRev = aggregate(rows,'category');
    const bestCat = Object.entries(catRev).sort((a,b)=>b[1]-a[1])[0];
    const prodRev = aggregate(rows,'product');
    const bestProduct = Object.entries(prodRev).sort((a,b)=>b[1]-a[1])[0];
    const totalRevenue = rows.reduce((s,o)=>s+o.revenue,0);
    const totalProfit = rows.reduce((s,o)=>s+o.profit,0);
    const margin = totalRevenue ? totalProfit/totalRevenue*100 : 0;
    const pending = rows.filter(o=>String(o.status).toLowerCase()==='pending').length;
    const insights = [
      ['✦','Leading category',`${bestCat[0]} contributes ${totalRevenue ? (bestCat[1]/totalRevenue*100).toFixed(1) : 0}% of revenue in the current selection.`],
      ['↗','Top product',`${bestProduct[0]} is the highest-revenue product at ${money(bestProduct[1])}.`],
      ['◎','Profit margin',`Recorded profit margin is ${margin.toFixed(1)}%. Imported rows without a profit field are treated as $0 profit.`],
      ['◷','Orders to review',`${pending} pending order${pending===1?'':'s'} in the current selection.`]
    ];
    box.innerHTML = insights.map(i=>`<div class="insight"><div class="insight-icon">${i[0]}</div><div><strong>${escapeHTML(i[1])}</strong><p>${escapeHTML(i[2])}</p></div></div>`).join('');
  }
  function renderTable(rows) {
    const query = $('tableSearch').value.trim().toLowerCase();
    const searched = rows.filter(o => [o.orderId,o.product,o.category,o.region,o.customer,o.status].some(v=>String(v).toLowerCase().includes(query)));
    const pageCount = Math.max(1, Math.ceil(searched.length/pageSize));
    currentPage = Math.min(currentPage,pageCount);
    const start = (currentPage-1)*pageSize;
    const shown = searched.slice(start,start+pageSize);
    $('ordersBody').innerHTML = shown.length ? shown.map(o => {
      const status = String(o.status).toLowerCase();
      const statusClass = status.includes('refund') ? 'refunded' : status.includes('pending') ? 'pending' : 'paid';
      return `<tr><td><strong>${escapeHTML(o.orderId)}</strong></td><td><div class="product-cell"><span class="product-dot">${escapeHTML(o.product.slice(0,1).toUpperCase())}</span>${escapeHTML(o.product)}</div></td><td>${escapeHTML(o.category)}</td><td>${escapeHTML(o.date)}</td><td>${escapeHTML(o.region)}</td><td>${money(o.revenue)}</td><td>${money(o.profit)}</td><td><span class="status ${statusClass}">${escapeHTML(o.status)}</span></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">No matching orders found.</td></tr>';
    $('tableCount').textContent = searched.length ? `Showing ${start+1}–${Math.min(start+pageSize,searched.length)} of ${searched.length} orders` : 'Showing 0 orders';
    $('prevPage').disabled = currentPage <= 1; $('nextPage').disabled = currentPage >= pageCount;
    $('prevPage').style.opacity = currentPage<=1 ? '.45' : '1'; $('nextPage').style.opacity = currentPage>=pageCount ? '.45' : '1';
  }
  function update() {
    filteredOrders = getFiltered();
    const revenue = filteredOrders.reduce((s,o)=>s+o.revenue,0);
    const profit = filteredOrders.reduce((s,o)=>s+o.profit,0);
    const units = filteredOrders.reduce((s,o)=>s+(Number(o.quantity)||0),0);
    $('revenueKpi').textContent = money(revenue);
    $('ordersKpi').textContent = number(filteredOrders.length);
    $('profitKpi').textContent = money(profit);
    $('unitsKpi').textContent = number(units);
    $('marginBadge').textContent = `${revenue ? (profit/revenue*100).toFixed(1) : '0.0'}% margin`;
    $('dateRangeLabel').textContent = '◷  ' + $('dateFilter').selectedOptions[0].text;
    renderCharts(filteredOrders);
    renderInsights(filteredOrders);
    renderTable(filteredOrders);
  }
  function downloadCSV(rows, filename) {
    if (!rows.length) { toast('There are no rows to export.'); return; }
    const headers = ['order_id','product','category','date','region','quantity','revenue','profit','status','customer'];
    const csvCell = value => `"${String(value ?? '').replace(/"/g,'""')}"`;
    const content = [headers.join(','), ...rows.map(o=>headers.map(h=>csvCell(({order_id:o.orderId,product:o.product,category:o.category,date:o.date,region:o.region,quantity:o.quantity,revenue:o.revenue,profit:o.profit,status:o.status,customer:o.customer})[h])).join(','))].join('\r\n');
    const blob = new Blob([content],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} rows.`);
  }
  function handleUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        allOrders = parseCSV(String(reader.result)); customData = true; currentPage = 1;
        populateFilters(); $('dateFilter').value = 'all'; $('categoryFilter').value='all'; $('regionFilter').value='all';
        $('dataStatus').textContent = `● Imported CSV · ${number(allOrders.length)} rows`;
        update(); toast(`Imported ${allOrders.length} rows successfully.`);
      } catch (err) { toast(err.message || 'Could not read CSV.'); }
      $('csvInput').value = '';
    };
    reader.onerror = () => toast('Could not read this file.');
    reader.readAsText(file);
  }

  $('dateFilter').addEventListener('change',()=>{currentPage=1;update();});
  $('categoryFilter').addEventListener('change',()=>{currentPage=1;update();});
  $('regionFilter').addEventListener('change',()=>{currentPage=1;update();});
  $('trendGrouping').addEventListener('change',()=>renderCharts(filteredOrders));
  $('tableSearch').addEventListener('input',()=>{currentPage=1;renderTable(filteredOrders);});
  $('prevPage').addEventListener('click',()=>{currentPage=Math.max(1,currentPage-1);renderTable(filteredOrders);});
  $('nextPage').addEventListener('click',()=>{currentPage++;renderTable(filteredOrders);});
  $('exportBtn').addEventListener('click',()=>downloadCSV(filteredOrders,'commerceiq_filtered_report.csv'));
  $('tableExport').addEventListener('click',()=>downloadCSV(filteredOrders,'commerceiq_orders.csv'));
  const openUpload = () => $('csvInput').click();
  $('sideUpload').addEventListener('click',openUpload); $('uploadNav').addEventListener('click',e=>{e.preventDefault();openUpload();});
  $('csvInput').addEventListener('change',e=>handleUpload(e.target.files[0]));
  $('resetBtn').addEventListener('click',()=>{
    $('dateFilter').value='90'; $('categoryFilter').value='all'; $('regionFilter').value='all'; $('tableSearch').value=''; currentPage=1; update(); toast('Filters reset.');
  });

  allOrders = buildDemoData();
  populateFilters();
  update();
})();
