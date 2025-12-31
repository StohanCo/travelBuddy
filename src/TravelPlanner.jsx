import React, { useState, useEffect, useRef } from 'react';
import { Map, Marker, Overlay } from 'pigeon-maps';
import { MapPin, Info, Navigation, X, Loader2, FileSpreadsheet, AlertCircle, RefreshCw, Share2, Check, Bug, Settings, Clock, ArrowDown, Filter, CheckSquare, Square, Map as MapIcon, List, Image as ImageIcon, Trash2, FolderOpen } from 'lucide-react';

// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
const LOGGING_URL = ""; 

// --- Helper: Smart Image Link Fixer ---
const fixImageLink = (url) => {
  if (!url || typeof url !== 'string') return '';
  let newUrl = url.trim();

  if (newUrl.includes('drive.google.com')) {
    const idMatch = newUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
    }
    const idParamMatch = newUrl.match(/id=([a-zA-Z0-9-_]+)/);
    if (idParamMatch && idParamMatch[1]) {
      return `https://drive.google.com/uc?export=view&id=${idParamMatch[1]}`;
    }
  }
  
  if (newUrl.includes('photos.app.goo.gl')) {
    return newUrl;
  }

  // Handle postimg.cc links - convert sharing page URLs to direct image URLs
  if (newUrl.includes('postimg.cc')) {
    // If it's already a direct image link (i.postimg.cc), return as-is
    if (newUrl.includes('i.postimg.cc')) {
      return newUrl;
    }
    // Convert postimg.cc sharing page to direct image link
    // e.g., https://postimg.cc/ABC123 -> https://i.postimg.cc/ABC123/image.jpg
    const postimgMatch = newUrl.match(/postimg\.cc\/([a-zA-Z0-9]+)/);
    if (postimgMatch && postimgMatch[1]) {
      return `https://i.postimg.cc/${postimgMatch[1]}/image.jpg`;
    }
  }

  return newUrl;
};

// --- Helper: Color Styles based on Type ---
const getTypeStyles = (type) => {
  if (!type) return {
    border: 'border-l-4 border-l-transparent',
    badge: 'bg-slate-100 text-slate-500 border-slate-200',
    number: 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
    pin: '#2563eb', // blue-600
    bg: '#eff6ff'   // blue-50
  };

  const t = type.toLowerCase().trim();

  if (['food', 'restaurant', 'cafe', 'dinner', 'lunch', 'breakfast', 'bar', 'snack'].some(x => t.includes(x))) {
    return {
      border: 'border-l-4 border-l-orange-400',
      badge: 'bg-orange-100 text-orange-800 border-orange-200',
      number: 'bg-orange-100 text-orange-600 group-hover:bg-orange-500 group-hover:text-white',
      pin: '#f97316', // orange-500
      bg: '#fff7ed'   // orange-50
    };
  }

  if (['hotel', 'stay', 'accommodation', 'airbnb', 'motel', 'hostel'].some(x => t.includes(x))) {
    return {
      border: 'border-l-4 border-l-indigo-400',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      number: 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white',
      pin: '#6366f1', // indigo-500
      bg: '#eef2ff'   // indigo-50
    };
  }

  if (['sight', 'view', 'park', 'nature', 'hike', 'beach', 'garden'].some(x => t.includes(x))) {
    return {
      border: 'border-l-4 border-l-emerald-400',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      number: 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white',
      pin: '#10b981', // emerald-500
      bg: '#ecfdf5'   // emerald-50
    };
  }

  if (['attraction', 'museum', 'activity', 'tour', 'fun', 'landmark'].some(x => t.includes(x))) {
    return {
      border: 'border-l-4 border-l-rose-400',
      badge: 'bg-rose-100 text-rose-800 border-rose-200',
      number: 'bg-rose-100 text-rose-600 group-hover:bg-rose-500 group-hover:text-white',
      pin: '#f43f5e', // rose-500
      bg: '#fff1f2'   // rose-50
    };
  }

  return {
    border: 'border-l-4 border-l-slate-300',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    number: 'bg-slate-100 text-slate-600 group-hover:bg-slate-500 group-hover:text-white',
    pin: '#64748b', // slate-500
    bg: '#f1f5f9'   // slate-100
  };
};

// --- Helper: Robust HTML Table Parser ---
const parseHTML = (htmlText) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  
  let table = doc.querySelector('.waffle');
  
  if (!table) {
    const allTables = Array.from(doc.querySelectorAll('table'));
    if (allTables.length > 0) {
      table = allTables.reduce((prev, current) => {
        return (prev.querySelectorAll('tr').length > current.querySelectorAll('tr').length) ? prev : current;
      });
    }
  }

  if (!table) return { headers: [], rows: [] };

  let rawRows = Array.from(table.querySelectorAll('tr'));
  
  let rows = rawRows.filter(r => {
     const cells = r.querySelectorAll('td, th');
     if (cells.length === 0) return false;
     
     const hasText = r.innerText.trim().length > 0;
     const hasImg = r.querySelector('img') !== null;
     const hasBgImg = r.innerHTML.includes('background-image');
     
     return hasText || hasImg || hasBgImg;
  });

  if (rows.length < 2) return { headers: [], rows: [] };

  const headerCells = Array.from(rows[0].querySelectorAll('td, th'));
  const headers = headerCells.map(cell => cell.innerText.toLowerCase().trim());

  const data = [];
  
  for (let i = 1; i < rows.length; i++) {
    const cells = Array.from(rows[i].querySelectorAll('td, th'));
    while (cells.length < headers.length) cells.push({ innerText: '', querySelector: () => null, getAttribute: () => '' });
    const rowData = {};
    headers.forEach((header, index) => {
      const cell = cells[index];
      if (!cell) return;
      const imgTag = cell.querySelector('img');
      const style = cell.getAttribute('style') || '';
      const bgMatch = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
      if (imgTag) {
        rowData[index] = imgTag.src; 
      } else if (bgMatch && bgMatch[1]) {
        rowData[index] = bgMatch[1];
      } else {
        rowData[index] = cell.innerText.trim(); 
      }
    });
    data.push(Object.values(rowData));
  }
  return { headers, rows: data };
};

// --- Helper: CSV Parser ---
const parseCSV = (text) => {
  if (!text || typeof text !== 'string') return { headers: [], rows: [] };
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    if (char === '"') {
      if (insideQuotes && cleanText[i+1] === '"') { currentCell += '"'; i++; } else { insideQuotes = !insideQuotes; }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim()); currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      if (currentCell || currentRow.length > 0) { currentRow.push(currentCell.trim()); rows.push(currentRow); currentRow = []; currentCell = ''; }
    } else { currentCell += char; }
  }
  if (currentCell || currentRow.length > 0) { currentRow.push(currentCell.trim()); rows.push(currentRow); }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.toLowerCase().trim());
  return { headers, rows: rows.slice(1) };
};

// --- Helper: Location Data ---
const extractLocationData = (url) => {
  if (!url || typeof url !== 'string') return null;
  const coordsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const searchRegex = /search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/;
  let lat = null, lng = null;
  const coordsMatch = url.match(coordsRegex);
  if (coordsMatch) { lat = coordsMatch[1]; lng = coordsMatch[2]; }
  else {
    const searchMatch = url.match(searchRegex);
    if (searchMatch) { lat = searchMatch[1]; lng = searchMatch[2]; }
  }
  if (lat && lng) return { lat, lng };
  return null;
};

// --- COMPONENT: Interactive Map View ---
const RouteLines = ({ latLngToPixel, width, height, points, colors }) => {
  if (!points || points.length < 2 || !latLngToPixel) return null;
  
  return (
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
          {points.map((p, i) => {
              if (i === points.length - 1) return null;
              const nextP = points[i+1];
              const [x1, y1] = latLngToPixel([p.lat, p.lng]);
              const [x2, y2] = latLngToPixel([nextP.lat, nextP.lng]);
              
              return (
                  <line 
                      key={i}
                      x1={x1} y1={y1}
                      x2={x2} y2={y2}
                      stroke={colors[i % colors.length]}
                      strokeWidth={3}
                      strokeDasharray="6, 6"
                      strokeLinecap="round"
                      opacity={0.6}
                  />
              );
          })}
      </svg>
  );
};

const MapView = ({ items, onSelect }) => {
  const [center, setCenter] = useState([13.7563, 100.5018]);
  const [zoom, setZoom] = useState(6);
  const [popup, setPopup] = useState(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const [hasInitialized, setHasInitialized] = useState(false);
  const containerRef = useRef(null);

  // Colors for route segments
  const routeColors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f97316', // orange
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f59e0b', // amber
    '#6366f1', // indigo
  ];

  const validPoints = items.filter(i => i.coords && !i.isHeader).map(item => ({
    ...item,
    lat: parseFloat(item.coords.lat),
    lng: parseFloat(item.coords.lng)
  })).filter(i => !isNaN(i.lat) && !isNaN(i.lng));

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Only set initial center/zoom once when data first loads
  useEffect(() => {
    if (validPoints.length > 0 && !hasInitialized) {
      const lats = validPoints.map(p => p.lat);
      const lngs = validPoints.map(p => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      setCenter([(minLat + maxLat) / 2, (minLng + maxLng) / 2]);
      
      // Better zoom calculation with more padding
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const diff = Math.max(latDiff, lngDiff);
      
      let newZoom;
      if (diff > 20) newZoom = 2;
      else if (diff > 10) newZoom = 3;
      else if (diff > 5) newZoom = 4;
      else if (diff > 2) newZoom = 5;
      else if (diff > 1) newZoom = 6;
      else if (diff > 0.5) newZoom = 8;
      else if (diff > 0.1) newZoom = 10;
      else newZoom = 12;
      
      setZoom(newZoom);
      setHasInitialized(true);
    }
  }, [validPoints.length, hasInitialized]);

  // Reset initialization when items completely change (e.g., new sheet loaded)
  useEffect(() => {
    setHasInitialized(false);
  }, [items.length]);

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-140px)] bg-slate-100 rounded-xl overflow-hidden shadow-inner">
      <Map 
        height={containerHeight}
        center={center} 
        zoom={zoom}
        minZoom={1}
        maxZoom={18}
        onBoundsChanged={({ center, zoom }) => { 
          setCenter(center); 
          setZoom(zoom); 
        }}
      >
        <RouteLines points={validPoints} colors={routeColors} />

        {validPoints.map((item, idx) => {
          const styles = getTypeStyles(item.type);
          return (
            <Overlay key={idx} anchor={[item.lat, item.lng]} offset={[0, 0]}>
                <div 
                    className="flex items-center justify-center rounded-full shadow-md transition-transform hover:scale-110 cursor-pointer relative z-10"
                    style={{
                        backgroundColor: styles.bg,
                        color: styles.pin,
                        border: `3px solid ${styles.pin}`,
                        width: '32px',
                        height: '32px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        fontFamily: 'system-ui, sans-serif',
                        transform: 'translate(-50%, -50%)'
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setPopup({ item, anchor: [item.lat, item.lng] });
                    }}
                >
                    {idx + 1}
                </div>
            </Overlay>
          );
        })}

        {popup && (
            <Overlay anchor={popup.anchor} offset={[0, -50]}>
                <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[200px] relative z-50 animate-in fade-in zoom-in duration-200">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setPopup(null); }}
                        className="absolute top-1 right-1 text-slate-400 hover:text-slate-600"
                    >
                        <X size={14} />
                    </button>
                    <div className="font-bold text-slate-800 text-sm mb-1 pr-4">{popup.item.name}</div>
                    {popup.item.shortInfo && <div className="text-xs text-slate-500 mb-2 leading-tight">{popup.item.shortInfo}</div>}
                    <div className="flex justify-between items-center mt-2">
                        {popup.item.type && (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                {popup.item.type}
                            </span>
                        )}
                        <button 
                            onClick={() => onSelect(popup.item)}
                            className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 font-medium"
                        >
                            Details
                        </button>
                    </div>
                    {/* Triangle pointer */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-b border-r border-slate-100"></div>
                </div>
            </Overlay>
        )}
      </Map>

      {/* Fit All button */}
      {validPoints.length > 0 && (
        <button
          onClick={() => {
            const lats = validPoints.map(p => p.lat);
            const lngs = validPoints.map(p => p.lng);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            
            setCenter([(minLat + maxLat) / 2, (minLng + maxLng) / 2]);
            
            const diff = Math.max(maxLat - minLat, maxLng - minLng);
            let newZoom;
            if (diff > 20) newZoom = 2;
            else if (diff > 10) newZoom = 3;
            else if (diff > 5) newZoom = 4;
            else if (diff > 2) newZoom = 5;
            else if (diff > 1) newZoom = 6;
            else if (diff > 0.5) newZoom = 8;
            else if (diff > 0.1) newZoom = 10;
            else newZoom = 12;
            
            setZoom(newZoom);
            setPopup(null);
          }}
          className="absolute bottom-4 right-4 bg-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 z-20"
        >
          <MapIcon size={16} />
          Fit All
        </button>
      )}

      {validPoints.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 pointer-events-none">
          <div className="text-center text-slate-500">
            <MapIcon size={48} className="mx-auto mb-2 opacity-50" />
            <p>No locations with coordinates found.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default function TravelApp() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debugLog, setDebugLog] = useState(''); 
  const [appState, setAppState] = useState('SETUP');
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('LIST'); // LIST or MAP
  
  // New States for Features
  const [visited, setVisited] = useState({});
  const [activeFilter, setActiveFilter] = useState('All');
  const [categories, setCategories] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);

  // --- LOGGING SYSTEM ---
  useEffect(() => {
    if (appState === 'VIEW' && LOGGING_URL && !sessionStorage.getItem('has_logged_visit')) {
      const logVisit = async () => {
        try {
          let location = "Unknown";
          try {
            const locRes = await fetch('https://ipapi.co/json/');
            if (locRes.ok) {
              const locData = await locRes.json();
              location = `${locData.city}, ${locData.country_name}`;
            }
          } catch (e) {}

          const payload = {
            location: location,
            userAgent: navigator.userAgent,
            screen: `${window.screen.width}x${window.screen.height}`
          };

          await fetch(LOGGING_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
          });
          sessionStorage.setItem('has_logged_visit', 'true');
        } catch (err) {}
      };
      logVisit();
    }
  }, [appState]);

  useEffect(() => {
    // Load saved plans from localStorage
    const plans = localStorage.getItem('travel_saved_plans');
    if (plans) {
      setSavedPlans(JSON.parse(plans));
    }
    
    const params = new URLSearchParams(window.location.search);
    const urlFromParam = params.get('sheet');
    if (urlFromParam) {
      setSheetUrl(urlFromParam);
      fetchData(urlFromParam);
    } else {
      const savedUrl = localStorage.getItem('travel_sheet_url');
      if (savedUrl) {
        setSheetUrl(savedUrl);
        // Load saved visited state for the saved URL
        const savedVisited = localStorage.getItem(`visited_${savedUrl}`);
        if (savedVisited) setVisited(JSON.parse(savedVisited));
      }
    }
  }, []);

  const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });

  const toggleVisited = (id, e) => {
    e.stopPropagation();
    const newVisited = { ...visited, [id]: !visited[id] };
    setVisited(newVisited);
    localStorage.setItem(`visited_${sheetUrl}`, JSON.stringify(newVisited));
  };

  const copyShareLink = () => {
    const baseUrl = window.location.href.split('?')[0];
    const shareUrl = `${baseUrl}?sheet=${encodeURIComponent(sheetUrl)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const processUrl = (url, forceCSV = false) => {
    if (!url) return '';
    let cleanUrl = url.trim();
    
    // Already has export format
    if (cleanUrl.includes('output=csv') || cleanUrl.includes('format=csv')) return cleanUrl;
    
    // Extract the spreadsheet ID from various URL formats
    const idMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    
    if (forceCSV) {
       if (idMatch) {
         // Build clean CSV export URL
         return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=0`;
       }
       if (cleanUrl.includes('/pubhtml')) return cleanUrl.replace('/pubhtml', '/export?format=csv&gid=0');
    }
    
    // Handle /edit URLs
    if (cleanUrl.includes('/edit')) {
      return cleanUrl.replace(/\/edit.*$/, '/export?format=csv&gid=0');
    }
    
    // Handle /pubhtml URLs
    if (cleanUrl.includes('/pubhtml')) {
        if (!cleanUrl.includes('single=')) cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + 'gid=0&single=true';
        return cleanUrl;
    }
    
    // Handle base spreadsheet URL (no /edit or /pubhtml) - convert to CSV export
    if (idMatch) {
      return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=0`;
    }
    
    return cleanUrl;
  };

  const fetchWithProxy = async (url) => {
    // Try multiple CORS proxies
    const proxies = [
      (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}&t=${Date.now()}`,
      (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];

    for (const proxyFn of proxies) {
      try {
        const proxyUrl = proxyFn(url);
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const text = await response.text();
          // Check if we got actual data (not a redirect page or error)
          if (text && !text.includes('Temporary Redirect') && !text.includes('moved temporarily')) {
            return { text, source: proxyUrl.split('/')[2] };
          }
        }
      } catch (e) { 
        console.warn("Proxy failed", e); 
      }
    }
    
    throw new Error('All proxy methods failed');
  };

  const fetchData = async (urlToFetch, forceCSV = false) => {
    setLoading(true);
    setError(null);
    setDebugLog('');
    
    // Clear items immediately to show we're loading fresh data
    setItems([]);
    setSelectedItem(null);
    
    const processedUrl = processUrl(urlToFetch, forceCSV);
    setDebugLog(prev => prev + `Requesting: ${processedUrl}\n`);

    try {
      let text = '';
      let isHTML = false;

      try {
        const response = await fetch(processedUrl);
        if (response.ok) {
          text = await response.text();
          setDebugLog(prev => prev + `Method: Direct Fetch (Success)\n`);
        } else {
          throw new Error('Direct fetch blocked');
        }
      } catch (directErr) {
        try {
          const result = await fetchWithProxy(processedUrl);
          text = result.text;
          setDebugLog(prev => prev + `Method: Proxy (${result.source})\n`);
        } catch (proxyErr) {
          throw new Error('Connection failed. Google Sheets refused connection to both direct and proxy methods.');
        }
      }

      if (text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html')) {
        isHTML = true;
        
        // Check if it's a Google redirect/error page (not actual data)
        if (text.includes('Temporary Redirect') || text.includes('moved temporarily') || 
            text.includes('Sign in') || text.includes('accounts.google.com')) {
          setDebugLog(prev => prev + `Received Google redirect/auth page. Trying alternative method...\n`);
          // Try fetching with pub format
          const pubUrl = urlToFetch.replace(/\/edit.*$/, '/pub?output=csv&gid=0');
          try {
            const pubResult = await fetchWithProxy(pubUrl);
            text = pubResult.text;
            isHTML = text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html');
            setDebugLog(prev => prev + `Pub URL method: ${isHTML ? 'Still HTML' : 'Got CSV'}\n`);
          } catch (pubErr) {
            throw new Error('Spreadsheet may not be publicly shared. Please ensure "Anyone with the link" can view it.');
          }
        }
      }

      let headers = [];
      let rawRows = [];

      if (isHTML) {
        if (forceCSV) throw new Error('Received HTML but expected CSV. The spreadsheet may not be publicly shared.');
        setDebugLog(prev => prev + `Parsing as HTML table...\n`);
        const result = parseHTML(text);
        headers = result?.headers || [];
        rawRows = result?.rows || [];
        setDebugLog(prev => prev + `Found ${headers.length} columns, ${rawRows.length} rows\n`);
      } else {
        setDebugLog(prev => prev + `Parsing as CSV...\n`);
        const result = parseCSV(text);
        headers = result?.headers || [];
        rawRows = result?.rows || [];
        setDebugLog(prev => prev + `Found ${headers.length} columns, ${rawRows.length} rows\n`);
      }

      if (!headers || headers.length === 0) {
        setDebugLog(prev => prev + `Headers found: ${JSON.stringify(headers)}\n`);
        setDebugLog(prev => prev + `First 200 chars of response: ${text.substring(0, 200)}\n`);
        throw new Error(`Connected successfully, but found no data rows. Make sure the spreadsheet is publicly shared.`);
      }

      const mapIdx = {
        name: headers.findIndex(h => h.includes('name') || h.includes('place') || h.includes('location')),
        link: headers.findIndex(h => h.includes('link') || h.includes('map') || h.includes('url')),
        short: headers.findIndex(h => h.includes('short') || h.includes('hover') || h.includes('summary')),
        details: headers.findIndex(h => h.includes('detail') || h.includes('desc') || h.includes('info')),
        photo: headers.findIndex(h => h.includes('photo') || h.includes('img') || h.includes('pic')),
        travel: headers.findIndex(h => h.includes('travel') || h.includes('distance') || h.includes('time') || h.includes('duration')),
        type: headers.findIndex(h => h.includes('type') || h.includes('category') || h.includes('tag'))
      };

      if (mapIdx.name === -1 && mapIdx.link === -1) throw new Error(`Could not find "Name" or "Maps Link" columns.`);

      const uniqueCategories = new Set();

      const parsedItems = rawRows.map((row, idx) => {
        const link = mapIdx.link > -1 ? row[mapIdx.link] : '';
        const name = mapIdx.name > -1 ? row[mapIdx.name] : '';
        const isHeader = name && (!link || link.length < 5);
        const extractedLoc = extractLocationData(link);
        
        let displayName = name;
        if (displayName && displayName.includes('<')) {
           const tempDiv = document.createElement('div');
           tempDiv.innerHTML = displayName;
           displayName = tempDiv.innerText;
        }
        if (!displayName && extractedLoc) displayName = `Location ${idx + 1}`;
        else if (!displayName && !isHeader) displayName = "Unnamed Location";

        // Multi-image parsing
        let rawPhotoData = mapIdx.photo > -1 ? row[mapIdx.photo] : '';
        let photos = [];
        if (rawPhotoData) {
            photos = rawPhotoData.split(',').map(url => fixImageLink(url.trim())).filter(url => url.length > 5);
        }
        let primaryPhoto = photos.length > 0 ? photos[0] : '';
        
        const type = mapIdx.type > -1 ? row[mapIdx.type] : '';
        if (type) uniqueCategories.add(type);

        return {
          id: idx,
          name: displayName,
          mapLink: link,
          shortInfo: mapIdx.short > -1 ? row[mapIdx.short] : '',
          details: mapIdx.details > -1 ? row[mapIdx.details] : '',
          photo: primaryPhoto,
          photos: photos,
          travelText: mapIdx.travel > -1 ? row[mapIdx.travel] : '',
          type: type,
          coords: extractedLoc,
          isHeader: isHeader
        };
      }).filter(item => item.isHeader || (item.mapLink && item.mapLink.length > 5)); 

      if (parsedItems.length === 0) throw new Error('No valid locations found.');

      setItems(parsedItems);
      setCategories(Array.from(uniqueCategories));
      setAppState('VIEW');
      localStorage.setItem('travel_sheet_url', urlToFetch);
      
      // Save this plan to the list of saved plans
      const planName = parsedItems.find(item => item.isHeader)?.name || 
                       parsedItems[0]?.name || 
                       'Unnamed Trip';
      const locationCount = parsedItems.filter(item => !item.isHeader).length;
      
      const existingPlans = JSON.parse(localStorage.getItem('travel_saved_plans') || '[]');
      const planIndex = existingPlans.findIndex(p => p.url === urlToFetch);
      
      const planData = {
        url: urlToFetch,
        name: planName,
        locationCount: locationCount,
        lastOpened: new Date().toISOString()
      };
      
      if (planIndex > -1) {
        // Update existing plan
        existingPlans[planIndex] = planData;
      } else {
        // Add new plan
        existingPlans.unshift(planData);
      }
      
      // Keep only the last 10 plans
      const trimmedPlans = existingPlans.slice(0, 10);
      localStorage.setItem('travel_saved_plans', JSON.stringify(trimmedPlans));
      setSavedPlans(trimmedPlans);
      
      // Load saved visited state for this specific URL
      const savedVisited = localStorage.getItem(`visited_${urlToFetch}`);
      if (savedVisited) {
        setVisited(JSON.parse(savedVisited));
      } else {
        // Clear visited state if this is a new URL
        setVisited({});
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
      setAppState('SETUP');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('travel_sheet_url');
    const url = new URL(window.location);
    url.searchParams.delete('sheet');
    window.history.pushState({}, '', url);
    setSheetUrl('');
    setItems([]);
    setAppState('SETUP');
  };

  const deleteSavedPlan = (planUrl, e) => {
    e.stopPropagation();
    const updatedPlans = savedPlans.filter(p => p.url !== planUrl);
    localStorage.setItem('travel_saved_plans', JSON.stringify(updatedPlans));
    localStorage.removeItem(`visited_${planUrl}`);
    setSavedPlans(updatedPlans);
  };

  const loadSavedPlan = (plan) => {
    setSheetUrl(plan.url);
    fetchData(plan.url);
  };

  const HoverCard = () => {
    if (!hoveredItem) return null;
    const hasPhoto = hoveredItem.photo && hoveredItem.photo.length > 5;
    if (!hasPhoto) return null;

    const isRightSide = mousePos.x > window.innerWidth / 2;
    const isBottomSide = mousePos.y > window.innerHeight / 2;

    const style = {
      top: mousePos.y + (isBottomSide ? -20 : 20),
      left: mousePos.x + (isRightSide ? -20 : 20),
      transform: `translate(${isRightSide ? '-100%' : '0'}, ${isBottomSide ? '-100%' : '0'})`
    };

    return (
      <div 
        className="fixed z-50 pointer-events-none p-2 bg-white rounded-lg shadow-xl border border-gray-200 w-48 animate-in fade-in zoom-in duration-200"
        style={style}
      >
        <div className="w-full h-32 overflow-hidden rounded bg-gray-100 relative">
            <img 
              src={hoveredItem.photo} 
              alt={hoveredItem.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => e.target.style.display = 'none'}
            />
        </div>
      </div>
    );
  };
  
  const displayedItems = items.filter(item => {
    if (activeFilter === 'All') return true;
    if (item.isHeader) return false;
    return item.type === activeFilter;
  });

  if (appState === 'SETUP') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6 mx-auto text-blue-600">
            <MapPin size={32} />
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Trip Planner</h1>
          <p className="text-slate-500 text-center mb-8">Connect your Google Sheet to start your journey.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Google Sheet Link</label>
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/..."
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
            </div>

            <button
              onClick={() => fetchData(sheetUrl, false)}
              disabled={loading || !sheetUrl}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" />
                  <span>Loading Data...</span>
                </>
              ) : 'Load Trip'}
            </button>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg flex flex-col gap-2 border border-red-100">
                <div className="flex items-start gap-3">
                  <AlertCircle className="shrink-0 w-5 h-5" />
                  <span className="font-bold">Connection Failed</span>
                </div>
                <p className="pl-8 text-xs">{error}</p>
                <div className="pl-8 mt-2 flex flex-col gap-2">
                    <button 
                        onClick={() => fetchData(sheetUrl, true)}
                        className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-center w-full font-semibold transition-colors shadow-sm"
                    >
                        Try Force CSV Mode (Text Only)
                    </button>
                    <details className="mt-2 text-xs text-slate-500 border border-slate-200 rounded bg-white p-2">
                        <summary className="cursor-pointer font-medium flex items-center gap-1">
                            <Bug size={12}/> View Debug Log
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] bg-slate-50 p-2 rounded">
                            {debugLog}
                        </pre>
                    </details>
                </div>
              </div>
            )}

            {/* Saved Plans Section */}
            {savedPlans.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen size={16} className="text-slate-400" />
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Plans</h2>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {savedPlans.map((plan, idx) => (
                    <div
                      key={idx}
                      onClick={() => loadSavedPlan(plan)}
                      className="group flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors border border-slate-100 hover:border-blue-200"
                    >
                      <div className="flex-grow min-w-0">
                        <p className="font-medium text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                          {plan.name}
                        </p>
                        <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{plan.locationCount} locations</span>
                          <span>•</span>
                          <span>{new Date(plan.lastOpened).toLocaleDateString()}</span>
                        </p>
                      </div>
                      <button
                        onClick={(e) => deleteSavedPlan(plan.url, e)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove from list"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans relative" onMouseMove={handleMouseMove}>
      <header className="bg-white shadow-sm sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-blue-600">
            <MapPin className="fill-blue-600 text-white" />
            <span className="font-bold text-lg tracking-tight text-slate-900">My Trip</span>
            </div>
            <div className="flex gap-2 items-center">
              {/* View Toggle */}
              <div className="bg-slate-100 p-1 rounded-lg flex mr-2">
                 <button 
                    onClick={() => setViewMode('LIST')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                    <List size={18} />
                 </button>
                 <button 
                    onClick={() => setViewMode('MAP')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'MAP' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                    <MapIcon size={18} />
                 </button>
              </div>

              <button
                  onClick={copyShareLink}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors flex items-center gap-1"
                  title="Copy Share Link"
              >
                  {copied ? <Check size={20} className="text-green-500" /> : <Share2 size={20} />}
              </button>
              <button
                  onClick={() => fetchData(sheetUrl)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  title="Refresh Data"
              >
                  <RefreshCw size={20} />
              </button>
              <button 
                  onClick={handleReset}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="Disconnect Sheet"
              >
                  <Settings size={20} />
              </button>
            </div>
        </div>
        
        {/* Category Filters (Only in List Mode) */}
        {viewMode === 'LIST' && categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                <button 
                    onClick={() => setActiveFilter('All')}
                    className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                        activeFilter === 'All' 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                >
                    All
                </button>
                {categories.map(cat => (
                    <button 
                        key={cat}
                        onClick={() => setActiveFilter(cat)}
                        className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                            activeFilter === cat 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-4 pb-20 space-y-0">
        {viewMode === 'MAP' ? (
           <MapView items={displayedItems} onSelect={setSelectedItem} />
        ) : (
          /* LIST VIEW */
          <>
            {items.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                No locations found in spreadsheet.
              </div>
            )}
            
            {displayedItems.map((item, idx) => {
              const styles = getTypeStyles(item.type);
              return (
              <React.Fragment key={idx}>
                {/* Section Header */}
                {item.isHeader ? (
                    <div className="py-6 flex items-center gap-4">
                        <div className="h-px bg-slate-200 flex-grow"></div>
                        <h2 className="text-lg font-bold text-slate-700 uppercase tracking-wider">{item.name}</h2>
                        <div className="h-px bg-slate-200 flex-grow"></div>
                    </div>
                ) : (
                    /* Standard Item */
                    <div className="relative">
                        {/* Travel Time Connector */}
                        {item.travelText && activeFilter === 'All' && (
                        <div className="flex flex-col items-center py-2 relative z-10 -my-2">
                            <div className="h-4 w-0.5 border-l-2 border-dashed border-blue-200"></div>
                            <div className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-100 shadow-sm flex items-center gap-1">
                                <Clock size={10} />
                                {item.travelText}
                                <ArrowDown size={10} />
                            </div>
                            <div className="h-4 w-0.5 border-l-2 border-dashed border-blue-200"></div>
                        </div>
                        )}
                        
                        <div 
                        className={`group relative bg-white rounded-xl shadow-sm hover:shadow-md border transition-all duration-200 overflow-hidden cursor-pointer z-20 mb-4 ${styles.border} ${visited[item.id] ? 'opacity-60 border-slate-100 bg-slate-50' : 'border-slate-100'}`}
                        onMouseEnter={() => setHoveredItem(item)}
                        onMouseLeave={() => setHoveredItem(null)}
                        >
                        <div className="flex items-start p-4 gap-4">
                            <div className="pt-2" onClick={(e) => toggleVisited(item.id, e)}>
                                {visited[item.id] ? (
                                    <CheckSquare className="text-blue-500 cursor-pointer" size={20} />
                                ) : (
                                    <Square className="text-slate-300 hover:text-blue-500 cursor-pointer" size={20} />
                                )}
                            </div>

                            <div className="flex-shrink-0">
                            {item.photo && item.photo.length > 5 ? (
                                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 relative">
                                <img 
                                    src={item.photo} 
                                    alt={item.name} 
                                    className={`w-full h-full object-cover ${visited[item.id] ? 'grayscale' : ''}`}
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { 
                                    e.target.style.display = 'none'; 
                                    e.target.parentNode.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-100 text-xs text-gray-400 text-center p-1">No Img</div>`;
                                    }} 
                                />
                                </div>
                            ) : (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${visited[item.id] ? 'bg-slate-200 text-slate-400' : styles.number}`}>
                                {idx + 1}
                                </div>
                            )}
                            </div>

                            <div className="flex-grow min-w-0 pt-1" onClick={() => setSelectedItem(item)}>
                                <div className="flex items-center gap-2">
                                    <h3 className={`font-bold truncate transition-colors text-lg ${visited[item.id] ? 'text-slate-500 line-through decoration-slate-400' : 'text-slate-800 group-hover:text-blue-600'}`}>
                                        {item.name}
                                    </h3>
                                    {item.type && (
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${styles.badge}`}>
                                            {item.type}
                                        </span>
                                    )}
                                </div>

                                {item.shortInfo && (
                                    <p className="text-sm text-slate-600 mt-1 line-clamp-2 leading-snug">
                                    {item.shortInfo}
                                    </p>
                                )}
                                {item.coords && item.coords.lat && (
                                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-2">
                                    <Navigation size={12} />
                                    {item.coords.lat}, {item.coords.lng}
                                    </p>
                                )}
                            </div>

                            <div className="flex-shrink-0 flex flex-col gap-2 pt-1">
                            <a 
                                href={item.mapLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Navigation size={20} />
                            </a>
                            {item.details && (
                                <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedItem(item);
                                }}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                >
                                <Info size={20} />
                                </button>
                            )}
                            </div>
                        </div>
                        </div>
                    </div>
                )}
              </React.Fragment>
            )})}
            
            {items.length > 0 && <div className="text-center pt-8 text-slate-400 text-sm">End of Itinerary</div>}
          </>
        )}
      </main>

      <div className="hidden md:block">
        <HoverCard />
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-xl text-slate-800 truncate pr-4">{selectedItem.name}</h2>
              <button 
                onClick={() => setSelectedItem(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-0">
              {/* PHOTO CAROUSEL / SINGLE PHOTO */}
              {selectedItem.photos && selectedItem.photos.length > 0 ? (
                  <div className="flex overflow-x-auto snap-x snap-mandatory h-64 bg-slate-100">
                      {selectedItem.photos.map((img, i) => (
                          <div key={i} className="w-full flex-shrink-0 relative snap-center">
                              <img 
                                  src={img} 
                                  alt={`${selectedItem.name} ${i+1}`}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                  crossOrigin="anonymous"
                                  onError={(e) => {
                                    e.target.onerror = null; 
                                    e.target.src = 'https://placehold.co/600x400?text=Image+Error';
                                  }}
                              />
                          </div>
                      ))}
                       {/* Optional indicator if multiple photos */}
                       {selectedItem.photos.length > 1 && (
                           <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full z-10">
                               {selectedItem.photos.length} photos
                           </div>
                       )}
                  </div>
              ) : null}

              <div className="p-6 space-y-6">
                {selectedItem.shortInfo && (
                  <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-lg font-medium leading-relaxed border border-blue-100 shadow-sm">
                    "{selectedItem.shortInfo}"
                  </div>
                )}
                <div className="prose prose-slate">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">Details</h3>
                  {selectedItem.details ? (
                    <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{selectedItem.details}</p>
                  ) : (
                    <p className="text-slate-400 italic">No additional details provided.</p>
                  )}
                </div>
                <a 
                  href={selectedItem.mapLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200"
                >
                  <Navigation size={20} />
                  Navigate to Location
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}