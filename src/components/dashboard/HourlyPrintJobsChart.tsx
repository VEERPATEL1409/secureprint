import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';
import { BarChart3, Clock, TrendingUp, Calendar, Info } from 'lucide-react';
import { PrintJob } from '../../types';

interface HourlyPrintJobsChartProps {
  jobs: PrintJob[];
  loading?: boolean;
}

interface HourDataPoint {
  hour: number;
  label: string;
  count: number;
  bwCount: number;
  colorCount: number;
  completedCount: number;
}

export const HourlyPrintJobsChart: React.FC<HourlyPrintJobsChartProps> = ({ jobs, loading = false }) => {
  const [viewMode, setViewMode] = useState<'business' | 'full'>('business');

  // Filter jobs for the current calendar day
  const todayJobs = useMemo(() => {
    const todayStr = new Date().toDateString();
    return jobs.filter((job) => {
      const jobDate = new Date(job.createdAt).toDateString();
      return jobDate === todayStr;
    });
  }, [jobs]);

  // Aggregate jobs by hour (0 to 23)
  const hourlyData = useMemo<HourDataPoint[]>(() => {
    const hourMap = new Map<number, { count: number; bw: number; color: number; completed: number }>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { count: 0, bw: 0, color: 0, completed: 0 });
    }

    todayJobs.forEach((job) => {
      const hour = new Date(job.createdAt).getHours();
      const entry = hourMap.get(hour);
      if (entry) {
        entry.count += 1;
        if (job.settings?.colorMode === 'COLOR') {
          entry.color += 1;
        } else {
          entry.bw += 1;
        }
        if (job.status === 'PRINTED') {
          entry.completed += 1;
        }
      }
    });

    const formatHourLabel = (h: number): string => {
      if (h === 0) return '12 AM';
      if (h < 12) return `${h} AM`;
      if (h === 12) return '12 PM';
      return `${h - 12} PM`;
    };

    const allHours: HourDataPoint[] = [];
    for (let h = 0; h < 24; h++) {
      const d = hourMap.get(h)!;
      allHours.push({
        hour: h,
        label: formatHourLabel(h),
        count: d.count,
        bwCount: d.bw,
        colorCount: d.color,
        completedCount: d.completed,
      });
    }

    if (viewMode === 'business') {
      // Standard shop working hours: 8:00 AM (8) to 9:00 PM (21)
      return allHours.filter((d) => d.hour >= 8 && d.hour <= 21);
    }
    return allHours;
  }, [todayJobs, viewMode]);

  // Insights
  const peakHour = useMemo(() => {
    if (todayJobs.length === 0) return null;
    let max = 0;
    let peak: HourDataPoint | null = null;
    for (const d of hourlyData) {
      if (d.count > max) {
        max = d.count;
        peak = d;
      }
    }
    return peak;
  }, [hourlyData, todayJobs.length]);

  const currentHour = new Date().getHours();
  const currentHourJobs = useMemo(() => {
    return hourlyData.find((d) => d.hour === currentHour)?.count || 0;
  }, [hourlyData, currentHour]);

  const maxCount = useMemo(() => {
    const max = Math.max(...hourlyData.map((d) => d.count), 0);
    return max > 4 ? max + 1 : 5;
  }, [hourlyData]);

  return (
    <div id="hourly-jobs-widget" className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Today's Hourly Print Traffic</span>
                <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Live
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Number of print submissions received per hour today ({new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })})
              </p>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('business')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              viewMode === 'business'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Business Hours (8am - 9pm)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('full')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              viewMode === 'full'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            24 Hours
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Today's Submissions
          </span>
          <div className="text-xl font-extrabold text-slate-900">{todayJobs.length}</div>
          <span className="text-[10px] text-slate-400">Total jobs initiated</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            This Hour ({currentHour === 0 ? '12 AM' : currentHour <= 12 ? `${currentHour} AM` : `${currentHour - 12} PM`})
          </span>
          <div className="text-xl font-extrabold text-emerald-600">{currentHourJobs}</div>
          <span className="text-[10px] text-emerald-700">Jobs this current hour</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Peak Hourly Volume
          </span>
          <div className="text-xl font-extrabold text-indigo-600">
            {peakHour && peakHour.count > 0 ? `${peakHour.count} jobs` : '0 jobs'}
          </div>
          <span className="text-[10px] text-indigo-700">
            {peakHour && peakHour.count > 0 ? `At ${peakHour.label}` : 'No peak yet'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Color vs B&W Ratio
          </span>
          <div className="text-xl font-extrabold text-slate-900">
            {todayJobs.filter((j) => j.settings?.colorMode === 'COLOR').length} /{' '}
            {todayJobs.filter((j) => j.settings?.colorMode !== 'COLOR').length}
          </div>
          <span className="text-[10px] text-slate-400">Color / Monochrome</span>
        </div>
      </div>

      {/* Chart Visualizer */}
      <div className="h-64 sm:h-72 w-full pt-2">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center bg-slate-50/50 rounded-xl animate-pulse">
            <span className="text-xs font-semibold text-slate-400">Loading hourly print data...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hourlyData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                interval={viewMode === 'full' ? 2 : 0}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, maxCount]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as HourDataPoint;
                    return (
                      <div className="p-3 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-800 text-xs space-y-2 min-w-44">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-bold">
                          <span className="text-slate-300 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{data.label} - {data.hour === 23 ? '12 AM' : hourlyData.find(d => d.hour === data.hour + 1)?.label || ''}</span>
                          </span>
                          <span className="font-mono text-emerald-400 text-sm">{data.count} {data.count === 1 ? 'job' : 'jobs'}</span>
                        </div>
                        <div className="space-y-1 text-[11px] text-slate-300">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Black & White:</span>
                            <span className="font-semibold text-white">{data.bwCount}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Color:</span>
                            <span className="font-semibold text-emerald-300">{data.colorCount}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                            <span className="text-slate-400">Completed:</span>
                            <span className="font-semibold text-indigo-300">{data.completedCount}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="count"
                name="Print Jobs"
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
              >
                {hourlyData.map((entry) => {
                  const isCurrent = entry.hour === currentHour;
                  const isPeak = peakHour && entry.hour === peakHour.hour && peakHour.count > 0;
                  let fillColor = '#10b981'; // emerald-500 default
                  if (isPeak) {
                    fillColor = '#059669'; // emerald-600 darker for peak
                  } else if (isCurrent) {
                    fillColor = '#34d399'; // emerald-400 for current
                  } else if (entry.count === 0) {
                    fillColor = '#e2e8f0'; // slate-200 for empty hour
                  }
                  return <Cell key={`cell-${entry.hour}`} fill={fillColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Info / Legend */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
            <span>Regular Volume</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
            <span>Peak Hour</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400 inline-block" />
            <span>Current Hour</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Hours reflect local counter time</span>
        </div>
      </div>
    </div>
  );
};
