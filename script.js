let currentGender = 'female';
let currentMetric = 'activity';
let dataset = [];

const timeParser = d3.timeParse('%Y-%m-%dT%H:%M:%S');
const width = 800;
const height = 800;
const radius = 300;

let zoom = d3.zoom().scaleExtent([1, 2.5]).on('zoom', zoomed);

const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

async function init() {
  try {
    const response = await fetch('https://ziyaozzz.github.io/dsc106-project3/processed_data_min.json.gz');
    const arrayBuffer = await response.arrayBuffer();

    // Decompress using pako
    const text = new TextDecoder("utf-8").decode(pako.inflate(arrayBuffer));

    // Parse JSON
    dataset = JSON.parse(text);

    dataset.forEach(d => {
        d.time = timeParser(d.time);
        d.activity = +d.activity;
        d.temp = +d.temp;
        d.minute = +d.minute;
    });

    renderClockChart();
  } catch (error) {
    console.error("Error fetching JSON:", error);
  }
}


function renderClockChart() {
  d3.select(".clock-chart").html('');

  const svg = d3.select(".clock-chart")
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(zoom);

  const g = svg.append('g')
      .attr('transform', `translate(${width/2},${height/2})`);

  svg.append('text')
      .attr('class', 'chart-title')
      .attr('x', width/2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .text(
        `${currentMetric === 'activity' ? 
          'Activity Count' : 
          'Temperature (°C)'
        } Over 24 Hours - ${
          currentGender.charAt(0).toUpperCase() + currentGender.slice(1)
        } Mice`
      );

  const validData = dataset.filter(d =>
      d.gender === currentGender && 
      d[currentMetric] !== null && 
      !isNaN(d[currentMetric]) &&
      d.minute !== null &&
      !isNaN(d.minute)
  );

  const hourlyData = d3.groups(validData, 
      d => d.mouseId,
      d => Math.floor(d.minute / 60)
  ).map(([mouseId, hourGroups]) => {
      const hourMap = new Map();
      hourGroups.forEach(([hour, values]) => {
          const mean = d3.mean(values, dd => Number(dd[currentMetric]));
          if (!isNaN(mean)) {
              hourMap.set(hour, mean);
          }
      });
      return [mouseId, hourMap];
  });

  const maxValue = currentMetric === 'activity' ? 34 : 19.5;
  const minValue = currentMetric === 'activity' ? 0 : 18;
  const valueScale = d3.scaleLinear()
      .domain([minValue, maxValue])
      .range([50, radius]);

  const axisCircles = [0.25, 0.5, 0.75, 1];
  axisCircles.forEach(percentage => {
      const r = radius * percentage;
      
      g.append('circle')
          .attr('r', r)
          .attr('fill', 'none')
          .attr('stroke', '#ddd')
          .attr('stroke-dasharray', '2,2');

      const value = valueScale.invert(r);
      g.append('text')
          .attr('x', 5)
          .attr('y', -r)
          .attr('fill', '#666')
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'middle')
          .style('font-size', '10px')
          .text(
            currentMetric === 'activity' ? 
              `${Math.round(value)} counts` : 
              `${value.toFixed(2)}°C`
          );
  });

  const hours = d3.range(0, 24);
  hours.forEach(hour => {
      const angle = (hour * 15 - 90) * (Math.PI / 180);
      const labelRadius = radius + 20;
      
      g.append('text')
          .attr('class', 'time-label')
          .attr('x', Math.cos(angle) * labelRadius)
          .attr('y', Math.sin(angle) * labelRadius)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .text(`${hour % 12 || 12}${hour < 12 ? 'AM' : 'PM'}`);

      g.append('line')
          .attr('class', 'hour-marker')
          .attr('x1', 0)
          .attr('y1', 0)
          .attr('x2', Math.cos(angle) * radius)
          .attr('y2', Math.sin(angle) * radius);
  });

  const radialLine = d3.lineRadial()
      .angle(d => ((d[0] * 15) - 90) * (Math.PI / 180))
      .radius(d => valueScale(d[1] || 0))
      .curve(d3.curveCardinalClosed);

  hourlyData.forEach(([mouseId, hourMap]) => {
      const lineData = Array.from({length: 24}, (_, hour) => {
          const value = hourMap.get(hour) || 0;
          return [hour, value];
      });

      g.append('path')
          .datum(lineData)
          .attr('class', 'mouse-line')
          .attr('id', `mouse-${mouseId}`)
          .attr('d', radialLine)
          .attr('fill', colorScale(mouseId))
          .attr('fill-opacity', 0.2)
          .attr('stroke', colorScale(mouseId))
          .attr('stroke-width', 2)
          .on('mousemove', (event) => {
              const [x, y] = d3.pointer(event, g.node());
              const angle = Math.atan2(y, x);
              const hour = (Math.floor(((angle * 180 / Math.PI + 90 + 360) % 360) / 15) + 12) % 24;
              showTooltip(event, mouseId, lineData, hour);
          })
          .on('mouseout', (event) => {
              if (!d3.select(event.currentTarget).classed('selected')) {
                  hideTooltip();
              }
          })
          .on('click', (event) => {
              event.stopPropagation();
              toggleMouseSelection(mouseId);
          });
  });

  svg.on('click', () => {
      clearAllSelections();
  });

  const legend = d3.select('.legend').html('');
//   legend.append('div')
//       .style('text-align', 'center')
//       .style('margin-bottom', '10px')
//       .style('font-weight', 'bold')
//       .text(`Mouse ID Legend (Click to highlight, hover to focus)`);

  hourlyData.forEach(([mouseId]) => {
      const item = legend.append('div')
          .attr('class', 'legend-item')
          .on('mouseover', () => {
              if (!d3.select(`#mouse-${mouseId}`).classed('selected')) {
                  d3.selectAll('.mouse-line').classed('dimmed', true);
                  d3.select(`#mouse-${mouseId}`).classed('dimmed', false);
              }
          })
          .on('mouseout', () => {
              if (!d3.selectAll('.mouse-line.selected').nodes().length) {
                  d3.selectAll('.mouse-line').classed('dimmed', false);
              }
          })
          .on('click', (event) => {
              event.stopPropagation();
              toggleMouseSelection(mouseId);
          });

      item.append('div')
          .attr('class', 'legend-color')
          .style('background-color', colorScale(mouseId));
      item.append('span').text(`Mouse ${mouseId}`);
  });
}

function zoomed(event) {
  const { transform } = event;
  d3.select('.clock-chart g')
    .attr('transform', `translate(${width/2},${height/2}) scale(${transform.k})`);
}

function showTooltip(event, mouseId, data, hour) {
    hideTooltip();

    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');

    const value = data[hour][1];

    tooltip.html(`
        <strong>Mouse ID:</strong> ${mouseId}<br>
        <strong>Time:</strong> ${hour % 12 || 12}${hour < 12 ? 'AM' : 'PM'}<br>
        <strong>${currentMetric === 'activity' ? 'Activity' : 'Temperature'}:</strong> 
        ${currentMetric === 'activity' ? 
            `${value.toFixed(0)} counts` : 
            `${value.toFixed(2)}°C`}
    `);
}


function hideTooltip() {
  d3.selectAll('.tooltip').remove();
}

function toggleMouseSelection(mouseId) {
  const line = d3.select(`#mouse-${mouseId}`);
  const legendItem = d3.selectAll('.legend-item')
    .filter((_, i, nodes) => nodes[i].textContent.includes(`Mouse ${mouseId}`));
  
  const wasSelected = line.classed('selected');
  clearAllSelections();

  if (!wasSelected) {
    line.classed('selected', true);
    legendItem.classed('selected', true);
    d3.selectAll('.mouse-line').classed('dimmed', function() {
      return !d3.select(this).classed('selected');
    });
  }
}

function clearAllSelections() {
  d3.selectAll('.mouse-line')
    .classed('selected', false)
    .classed('dimmed', false);
  d3.selectAll('.legend-item')
    .classed('selected', false);
  hideTooltip();
}

function toggleGender() {
  currentGender = currentGender === 'female' ? 'male' : 'female';
  d3.select(".controls button:first-child")
    .text(`Gender: ${currentGender.charAt(0).toUpperCase() + currentGender.slice(1)}`);
  renderClockChart();
}

function toggleMetric() {
  currentMetric = currentMetric === 'activity' ? 'temp' : 'activity';
  d3.select(".controls button:nth-child(2)")
    .text(`Metric: ${currentMetric.charAt(0).toUpperCase() + currentMetric.slice(1)}`);
  renderClockChart();
}


function handleSearch() {
  const searchInput = document.getElementById('mouseSearch');
  const searchValue = searchInput.value.trim().toLowerCase();
  
  if (!searchValue) {
    d3.selectAll('.mouse-line').style('display', 'block');
    clearAllSelections();
    return;
  }

  // 获取当前显示的所有鼠标ID（从legend中获取）
  const availableMouseIds = Array.from(document.querySelectorAll('.legend-item'))
    .map(item => item.textContent.match(/Mouse ([mf]\d+)/)[1]);

  // 构建搜索模式
  const searchId = searchValue.startsWith('m') || searchValue.startsWith('f') ? 
    searchValue : 
    `${currentGender.charAt(0)}${searchValue}`;

  // 查找匹配的鼠标ID
  const matchedId = availableMouseIds.find(id => id.toLowerCase() === searchId.toLowerCase());

  if (matchedId) {
    // 隐藏所有数据线
    d3.selectAll('.mouse-line').style('display', 'none');
    // 只显示搜索到的老鼠数据线
    d3.select(`#mouse-${matchedId}`).style('display', 'block');
    toggleMouseSelection(matchedId);
  } else {
    alert(`Mouse ID "${searchValue}" not found!`);
    d3.selectAll('.mouse-line').style('display', 'block');
    clearAllSelections();
  }
}

function resetSearch() {
  const searchInput = document.getElementById('mouseSearch');
  searchInput.value = ''; // 清空搜索框
  d3.selectAll('.mouse-line').style('display', 'block');
  clearAllSelections();
}

document.addEventListener('DOMContentLoaded', function() {
  init();
  
  const searchInput = document.getElementById('mouseSearch');
  if (searchInput) {
    // 添加回车键事件监听
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    });

    // 添加输入建议功能
    searchInput.addEventListener('input', function() {
      const value = this.value.trim().toLowerCase();
      if (!value) return;

      const searchId = value.startsWith('f') ? value : `f${value}`;
      const validData = dataset.filter(d => d.gender === currentGender);
      const availableMouseIds = [...new Set(validData.map(d => d.mouseId))];
      
      // 如果输入的值完全匹配某个ID，自动触发搜索
      if (availableMouseIds.some(id => id.toLowerCase() === searchId)) {
        handleSearch();
      }
    });
  }

  // 添加reset按钮的事件监听器
  const resetButton = document.querySelector('.search-container button');
  if (resetButton) {
    resetButton.addEventListener('click', resetSearch);
  }
});

// 删除重复的init()调用
// init();
