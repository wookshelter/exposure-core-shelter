'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, Activity, Network } from 'lucide-react';
import { type SearchIndexEntry } from '@/constants';

interface SearchResult {
  id: string;
  name: string;
  network: string;
  protocol: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [dynamicIndex, setDynamicIndex] = useState<SearchIndexEntry[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/search-index');
        if (!response.ok) return;
        const json = (await response.json()) as unknown;
        if (!Array.isArray(json)) return;
        setDynamicIndex(json as SearchIndexEntry[]);
      } catch {
        // ignore
      }
    };

    void load();
  }, []);

  const searchResults = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    // Dynamic index (vaults/markets/etc.)
    for (const entry of dynamicIndex) {
      const haystack = `${entry.name} ${entry.id} ${entry.nodeId} ${entry.protocol} ${entry.chain}`.toLowerCase();
      if (!haystack.includes(q)) continue;
      results.push({
        id: entry.id,
        name: entry.name,
        network: entry.chain,
        protocol: entry.protocol,
      });
    }

    // De-dupe and cap results to avoid rendering hundreds/thousands of rows.
    const deduped: SearchResult[] = [];
    const seen = new Set<string>();
    for (const item of results) {
      const key = `${item.id}|${item.network}|${item.protocol}|${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 50) break;
    }

    return deduped;
  }, [query, dynamicIndex]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-4 max-w-4xl mx-auto">
      <div className="w-full max-w-2xl text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-full mb-6">
            <Activity className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
          Exposure Graph
        </h1>
        <p className="text-xl text-gray-500">
          Search for an asset to visualize its complete exposure map.
        </p>
      </div>

      <div className="w-full max-w-xl relative">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-2xl text-lg text-gray-900 shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            placeholder="Search asset (e.g., mBTC, Ethereum)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* Decorative shadow/glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl opacity-0 group-focus-within:opacity-20 transition-opacity -z-10 blur-sm"></div>
        </div>

        {/* Results Dropdown */}
        {(query.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-10 animate-in fade-in slide-in-from-top-2 duration-200">
            {searchResults.length > 0 ? (
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {searchResults.map((result, idx) => (
                    <Link
                      key={`${result.id}-${result.network}-${result.protocol}`}
                    href={`/asset/${result.id}?chain=${result.network}&protocol=${encodeURIComponent(result.protocol)}`}
                      className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group"
                    >
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-start">
                            <span className="font-medium text-gray-900 flex items-center gap-2">
                              {result.name}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 uppercase tracking-wide border border-gray-200">
                                {result.network}
                              </span>
                            </span>
                            <span className="text-xs text-gray-500">
                              {result.protocol}
                            </span>
                        </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-600 transform group-hover:translate-x-1 transition-all" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                No assets found matching "{query}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer / Helper */}
      <div className="mt-12 text-sm text-gray-400">
        Try searching for <span className="font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-200" onClick={() => setQuery('Morpho')}>Morpho</span> or <span className="font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-200" onClick={() => setQuery('mHYPER')}>mHYPER</span>
      </div>
    </div>
  );
}
