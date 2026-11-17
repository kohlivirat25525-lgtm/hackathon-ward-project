import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Compass,
  Droplets,
  Eye,
  EyeOff,
  FileCheck2,
  Hammer,
  Lightbulb,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import type { PublicBootstrapResponse } from '../lib/api';
import { api, formatSlaDelta } from '../lib/api';
import type {
  DuplicateCandidate,
  IssueCategory,
  IssueSeverity,
  PublicComplaint,
} from '../types/wardwise';
import type { PublicRoute } from '../components/Layout';
import { ResilientImage } from '../components/ResilientImage';
import { RevealBlock, StatusIndicator, WARDWISE_EASE } from '../components/DesignSystem';

interface ReportIssuePageProps {
  data: PublicBootstrapResponse | null;
  onSubmitted: () => Promise<void> | void;
  onNavigate: (route: PublicRoute, query?: string) => void;
}

interface CitizenCategoryOption {
  id: string;
  label: string;
  subCategory: string;
  mappedCategory: IssueCategory;
  description: string;
  sampleTitle: string;
  sampleDesc: string;
  icon: typeof Wrench;
}

const CITIZEN_CATEGORIES: CitizenCategoryOption[] = [
  {
    id: 'potholes',
    label: 'Potholes',
    subCategory: 'Potholes & Sinkholes',
    mappedCategory: 'Roads & Pavement',
    description: 'Deep asphalt cavities, sunken utility covers, or sudden curb collapse.',
    sampleTitle: 'Deep arterial pothole endangering bus lane',
    sampleDesc: 'Approx 40cm wide asphalt break near right-turn apron causing vehicles to swerve.',
    icon: Wrench,
  },
  {
    id: 'garbage',
    label: 'Garbage',
    subCategory: 'Overflowing Waste & Dumping',
    mappedCategory: 'Sanitation & Waste',
    description: 'Missed refuse collection, illegal street dumping, or overflowing bins.',
    sampleTitle: 'Uncollected commercial waste pile blocking alley',
    sampleDesc: 'Overflowing municipal bins left uncollected for 48h near pedestrian market entrance.',
    icon: Trash2,
  },
  {
    id: 'streetlight',
    label: 'Streetlight',
    subCategory: 'Streetlight & Pole Outage',
    mappedCategory: 'Street Lighting & Power',
    description: 'Dark crosswalk lamps, flickering LED fixtures, or exposed pole wiring.',
    sampleTitle: 'Three consecutive pedestrian streetlamps dark',
    sampleDesc: 'Corner lighting circuit out since dusk along main transit footbridge approach.',
    icon: Lightbulb,
  },
  {
    id: 'water-leakage',
    label: 'Water Leakage',
    subCategory: 'Water Main & Pipe Leak',
    mappedCategory: 'Water & Drainage',
    description: 'Pressurized pipe bursts, bubbling pavement seams, or broken hydrants.',
    sampleTitle: 'Pressurized clean water leak from sidewalk valve',
    sampleDesc: 'Steady stream surfacing between stone curb joints creating slippery walkway.',
    icon: Droplets,
  },
  {
    id: 'drainage',
    label: 'Drainage',
    subCategory: 'Blocked Storm Drain',
    mappedCategory: 'Water & Drainage',
    description: 'Clogged storm grates, backed-up catch basins, or standing floodwater.',
    sampleTitle: 'Stormwater catch basin backed up across crosswalk',
    sampleDesc: 'Grate obstructed by silt and debris causing 15cm standing water after rain.',
    icon: Compass,
  },
  {
    id: 'road-damage',
    label: 'Road Damage',
    subCategory: 'Carriageway & Sidewalk Fracture',
    mappedCategory: 'Roads & Pavement',
    description: 'Cracked concrete slabs, faded lane markings, or loose paving stones.',
    sampleTitle: 'Heaved sidewalk paving slabs near school gate',
    sampleDesc: 'Tree roots and freeze stress lifted concrete slabs creating a trip hazard.',
    icon: Hammer,
  },
  {
    id: 'public-sanitation',
    label: 'Public Sanitation',
    subCategory: 'Public Restroom & Hygiene',
    mappedCategory: 'Sanitation & Waste',
    description: 'Sanitation stations, bio-hazards, or plaza cleaning maintenance.',
    sampleTitle: 'Transit plaza sanitation kiosk requires deep servicing',
    sampleDesc: 'Water supply valve jammed and refuse receptacle needs urgent sanitary servicing.',
    icon: Sparkles,
  },
  {
    id: 'other-issue',
    label: 'Other Issue',
    subCategory: 'Signals, Parks & Urban Canopy',
    mappedCategory: 'Traffic & Signals',
    description: 'Malfunctioning traffic signals, damaged signage, or fallen park branches.',
    sampleTitle: 'Pedestrian signal countdown display unresponsive',
    sampleDesc: 'Walk phase indicator fails to illuminate on north-south crossing mast.',
    icon: AlertTriangle,
  },
];

const SEVERITIES: { value: IssueSeverity; label: string; hint: string }[] = [
  { value: 'Low', label: 'Low', hint: 'Minor wear; standard queue scheduling.' },
  { value: 'Medium', label: 'Medium', hint: 'Noticeable disruption; standard ordinance SLA.' },
  { value: 'High', label: 'High', hint: 'Active safety or mobility impact; priority dispatch.' },
  { value: 'Critical', label: 'Critical', hint: 'Immediate hazard; triggers preemptive Tier-2 alert.' },
];

export function ReportIssuePage({ data, onSubmitted, onNavigate }: ReportIssuePageProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedCatId, setSelectedCatId] = useState<string>('potholes');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('High');
  const [observedDate, setObservedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [observedWindow, setObservedWindow] = useState('Morning (06:00–12:00)');
  const [isPublic, setIsPublic] = useState(true);
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [wardId, setWardId] = useState<string>('w04');
  const [address, setAddress] = useState('Halsted & 14th St Corridor');
  const [mapX, setMapX] = useState<number>(46);
  const [mapY, setMapY] = useState<number>(60);
  const [lat, setLat] = useState<number>(40.7091);
  const [lng, setLng] = useState<number>(-74.011);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    complaint: PublicComplaint;
    duplicateCandidates: DuplicateCandidate[];
  } | null>(null);

  const selectedCat = useMemo(
    () => CITIZEN_CATEGORIES.find((c) => c.id === selectedCatId) || CITIZEN_CATEGORIES[0],
    [selectedCatId]
  );

  const wards = data?.wards || [];
  const selectedWard = useMemo(
    () => wards.find((w) => w.id === wardId) || wards[0],
    [wards, wardId]
  );

  const matchedSlaPolicy = useMemo(() => {
    return data?.slaPolicies.find((p) => p.category === selectedCat.mappedCategory);
  }, [data, selectedCat.mappedCategory]);

  const nearbyExistingIssues = useMemo(() => {
    if (!data?.complaints) return [];
    return data.complaints.filter(
      (c) =>
        c.wardId === wardId &&
        c.category === selectedCat.mappedCategory &&
        c.status !== 'Closed'
    );
  }, [data, wardId, selectedCat.mappedCategory]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadingPhoto(true);
    try {
      const remainingSlots = 4 - photoUrls.length;
      const toUpload = Array.from(files).slice(0, remainingSlots);
      for (const file of toUpload) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          throw new Error('Only PNG, JPEG, or WebP images are accepted.');
        }
        if (file.size > 6 * 1024 * 1024) {
          throw new Error('Each image must be 6MB or smaller.');
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read image file.'));
          reader.readAsDataURL(file);
        });
        const uploaded = await api.uploadImage(dataUrl, file.name);
        setPhotoUrls((prev) => [...prev, uploaded.url].slice(0, 4));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(4, Math.min(96, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const clickY = Math.max(4, Math.min(96, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    setMapX(clickX);
    setMapY(clickY);

    if (wards.length > 0) {
      let nearest =
        wards.find(
          (w) =>
            clickX >= w.mapBounds.x1 &&
            clickX <= w.mapBounds.x2 &&
            clickY >= w.mapBounds.y1 &&
            clickY <= w.mapBounds.y2
        ) || wards[0];

      if (
        !(
          clickX >= nearest.mapBounds.x1 &&
          clickX <= nearest.mapBounds.x2 &&
          clickY >= nearest.mapBounds.y1 &&
          clickY <= nearest.mapBounds.y2
        )
      ) {
        let bestDist = Infinity;
        for (const w of wards) {
          const d = Math.hypot(w.mapBounds.centerX - clickX, w.mapBounds.centerY - clickY);
          if (d < bestDist) {
            bestDist = d;
            nearest = w;
          }
        }
      }

      setWardId(nearest.id);
      const offsetLat = Number((nearest.mapBounds.lat + (50 - clickY) * 0.00025).toFixed(5));
      const offsetLng = Number((nearest.mapBounds.lng + (clickX - 50) * 0.0003).toFixed(5));
      setLat(offsetLat);
      setLng(offsetLng);
      setGeoMessage(`Pinned coordinates (${clickX}%, ${clickY}%) inside ${nearest.code} · ${nearest.name}`);
    }
  };

  const handleUseGpsOrCenter = () => {
    if ('geolocation' in navigator) {
      setGeoMessage('Acquiring browser GPS coordinates…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(Number(pos.coords.latitude.toFixed(5)));
          setLng(Number(pos.coords.longitude.toFixed(5)));
          if (selectedWard) {
            setMapX(selectedWard.mapBounds.centerX);
            setMapY(selectedWard.mapBounds.centerY);
          }
          setGeoMessage(
            `GPS verified (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}) mapped to ${
              selectedWard?.code || 'WARD-04'
            }.`
          );
        },
        () => {
          if (selectedWard) {
            setMapX(selectedWard.mapBounds.centerX);
            setMapY(selectedWard.mapBounds.centerY);
            setLat(selectedWard.mapBounds.lat);
            setLng(selectedWard.mapBounds.lng);
            setGeoMessage(`Snapped pin to ${selectedWard.code} Municipal Sector Center.`);
          }
        },
        { timeout: 3500 }
      );
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!title.trim() || !description.trim()) {
      setSubmitError('Issue title and detailed description are required.');
      setStep(2);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitComplaint({
        title: title.trim(),
        description: description.trim(),
        category: selectedCat.mappedCategory,
        subCategory: selectedCat.subCategory,
        severity,
        wardId,
        address: address.trim() || `${selectedWard?.name || 'Municipal'} Sector`,
        lat,
        lng,
        mapX,
        mapY,
        observedDate,
        observedWindow,
        photoUrl: photoUrls[0] || null,
        photoUrls,
        isPublic,
        reporterName: isPublic ? reporterName.trim() || 'Civic Resident' : 'Confidential Resident',
        reporterContact: reporterContact.trim(),
      });
      setSubmittedReceipt(res);
      await onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to file complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setSubmittedReceipt(null);
    setStep(1);
    setTitle('');
    setDescription('');
    setPhotoUrls([]);
    setReporterName('');
    setReporterContact('');
    setSubmitError(null);
  };

  // =========================================================
  // CONFIRMATION DOCKET VIEW
  // =========================================================
  if (submittedReceipt) {
    const { complaint, duplicateCandidates } = submittedReceipt;
    const sla = formatSlaDelta(complaint.slaDeadline, complaint.fairSlaCreditHours, complaint.status);

    return (
      <section className="w-full bg-[#faf9f5] py-10 md:py-16">
        <div className="max-w-4xl mx-auto px-5 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: WARDWISE_EASE }}
            className="bg-white border border-[#e2e8f0] rounded-2xl p-7 sm:p-10 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#059669]">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#059669]">
                    Dispatch Docket Issued · Live Record
                  </span>
                  <h1 className="font-display text-3xl text-[#0b1221] font-normal mt-0.5">
                    Ticket <span className="font-mono-tabular font-bold">#{complaint.id}</span> Confirmed
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <StatusIndicator status={complaint.status} isOverdue={sla.isOverdue} />
                <span className="text-[#64748b]" aria-hidden="true">·</span>
                <span className="font-mono-tabular font-semibold text-[#0b1221]">
                  Tier {complaint.escalationTier}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 my-7">
              <div className="p-5 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] space-y-2.5 text-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                  Automated Routing Assignment
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Category</span>
                  <span className="font-semibold text-[#0b1221]">{complaint.category}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Identified Ward</span>
                  <span className="font-semibold text-[#0b1221]">{complaint.wardName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Assigned Department</span>
                  <span className="font-semibold text-[#1e40af] text-right">{complaint.departmentName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Assigned Officer</span>
                  <span className="font-semibold text-[#0b1221]">{complaint.assignedOfficerName}</span>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] space-y-2.5 text-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                  Enforced SLA &amp; Ledger Seal
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Severity Priority</span>
                  <span className="font-bold text-[#0b1221]">{complaint.severity}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">SLA Window</span>
                  <span className="font-mono-tabular font-bold text-[#0b1221]">{complaint.slaHours} Hours</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Deadline Status</span>
                  <span className="font-mono-tabular font-bold text-[#059669]">{sla.label}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#475569]">Map Visibility</span>
                  <span className="font-semibold text-[#0b1221]">
                    {complaint.isPublic ? 'Published (PII Stripped)' : 'Confidential Only'}
                  </span>
                </div>
              </div>
            </div>

            {complaint.recordHash && (
              <div className="mb-6 p-3.5 rounded-xl bg-[#0b1221] text-white flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#60a5fa]" />
                  Cryptographic Docket Digest
                </span>
                <span className="font-mono-tabular font-semibold text-[#93c5fd]">{complaint.recordHash}</span>
              </div>
            )}

            {duplicateCandidates.length > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 text-[#d97706]" />
                  Proximity Duplicate Scan Flagged ({duplicateCandidates[0].confidenceScore}% Match)
                </div>
                <p className="leading-relaxed">
                  Our spatial engine flagged similarity with existing issue #
                  {duplicateCandidates[0].primaryId === complaint.id
                    ? duplicateCandidates[0].secondaryId
                    : duplicateCandidates[0].primaryId}
                  . Dispatch supervisors have been notified so crews can coordinate without losing your individual receipt.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => onNavigate('/track', `id=${encodeURIComponent(complaint.id)}`)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
              >
                <span>Track #{complaint.id} Live</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/map', `ward=${encodeURIComponent(complaint.wardId)}`)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] text-[#0b1221] border border-[#e2e8f0] text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-[#1e40af]" />
                <span>Inspect on Live City Map</span>
              </button>
              <button
                type="button"
                onClick={resetWizard}
                className="ml-auto text-xs font-semibold text-[#475569] hover:text-[#0b1221] cursor-pointer"
              >
                Submit Another Grievance →
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  // =========================================================
  // 5-STEP REPORT SUBMISSION WIZARD
  // =========================================================
  return (
    <section className="w-full bg-[#faf9f5] pb-20">
      <div className="max-w-[1320px] mx-auto px-5 md:px-10 lg:px-16 pt-6">
        {/* Editorial Header */}
        <RevealBlock className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-[#e2e8f0]">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#1e40af]">
              Citizen Filing Dispatch
            </span>
            <h1 className="font-display text-4xl sm:text-5xl text-[#0b1221] font-normal mt-2">
              Report a civic <span className="italic text-[#475569]">issue.</span>
            </h1>
            <p className="text-sm sm:text-base text-[#475569] mt-2.5 max-w-2xl leading-relaxed">
              Every verified report automatically identifies your municipal ward, assigns the accountable bureau,
              checks nearby duplicates, and initiates an enforceable SLA clock.
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-[#475569] bg-white px-4 py-3 rounded-xl border border-[#e2e8f0] shrink-0">
            <ShieldCheck className="w-4 h-4 text-[#1e40af] shrink-0" />
            <span>Zero private contact details are published on public maps</span>
          </div>
        </RevealBlock>

        {/* 5-Step Progress Track */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-8">
          {[
            { num: 1 as const, label: 'Category' },
            { num: 2 as const, label: 'Details & Severity' },
            { num: 3 as const, label: 'Photo Evidence' },
            { num: 4 as const, label: 'Location & Ward' },
            { num: 5 as const, label: 'Review & Submit' },
          ].map((item) => {
            const active = step === item.num;
            const done = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  if (item.num <= step || (item.num === 2 && selectedCatId)) {
                    setStep(item.num);
                  }
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-[#0b1221] text-white border-[#0b1221] shadow-sm'
                    : done
                    ? 'bg-[#dbeafe]/45 text-[#0b1221] border-[#93c5fd]'
                    : 'bg-white text-[#475569] border-[#e2e8f0] hover:bg-[#f2f4f8]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono-tabular font-bold">
                  <span className={active ? 'text-[#93c5fd]' : 'text-[#64748b]'}>STEP 0{item.num}</span>
                  {done && <Check className="w-3.5 h-3.5 text-[#059669]" />}
                </div>
                <div className="text-xs font-semibold mt-1 truncate">{item.label}</div>
              </button>
            );
          })}
        </div>

        {submitError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-[#dc2626]">
            {submitError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Wizard Body */}
          <div className="lg:col-span-8 bg-white border border-[#e2e8f0] rounded-2xl p-6 sm:p-8 shadow-xs">
            {/* STEP 1: CATEGORY SELECTION */}
            {step === 1 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div>
                    <h2 className="font-display text-2xl text-[#0b1221]">Select Issue Classification</h2>
                    <p className="text-xs text-[#475569] mt-1">
                      Determines automated department routing and municipal SLA ordinance timeframe.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(selectedCat.sampleTitle);
                      setDescription(selectedCat.sampleDesc);
                      setStep(2);
                    }}
                    className="text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    Pre-fill Sample Case &amp; Continue →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {CITIZEN_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const active = selectedCatId === cat.id;
                    const policy = data?.slaPolicies.find((p) => p.category === cat.mappedCategory);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCatId(cat.id)}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                          active
                            ? 'bg-[#dbeafe]/35 border-[#1e40af] ring-1 ring-[#1e40af]'
                            : 'bg-[#faf9f5] border-[#e2e8f0] hover:bg-[#f2f4f8]'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            active
                              ? 'bg-[#1e40af] text-white'
                              : 'bg-white border border-[#e2e8f0] text-[#0b1221]'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#0b1221]">{cat.label}</span>
                            <span className="text-[11px] font-mono-tabular font-semibold text-[#475569] shrink-0">
                              {policy ? `${policy.targetHours}h SLA` : '24h SLA'}
                            </span>
                          </div>
                          <p className="text-xs text-[#475569] mt-1 leading-relaxed">{cat.description}</p>
                          <span className="block text-[11px] font-semibold text-[#1e40af] mt-1.5">
                            Routes to {cat.mappedCategory}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 pt-5 border-t border-[#e2e8f0] flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <span>Continue to Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: DETAILS, SEVERITY & PRIVACY */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl text-[#0b1221]">Describe Condition &amp; Severity</h2>
                    <p className="text-xs text-[#475569] mt-1">
                      Classification: <strong className="text-[#0b1221]">{selectedCat.label}</strong> ·{' '}
                      {selectedCat.mappedCategory}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!title) setTitle(selectedCat.sampleTitle);
                      if (!description) setDescription(selectedCat.sampleDesc);
                    }}
                    className="text-xs font-semibold text-[#1e40af] hover:underline cursor-pointer"
                  >
                    Insert Example Text
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0b1221] mb-1.5">
                    Headline Summary <span className="text-[#dc2626]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`e.g., ${selectedCat.sampleTitle}`}
                    className="w-full px-4 py-3 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-sm text-[#0b1221] focus:outline-none focus:border-[#1e40af]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0b1221] mb-1.5">
                    Field Description &amp; Hazard Context <span className="text-[#dc2626]">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide landmarks, approximate dimensions, and pedestrian or traffic risk..."
                    className="w-full px-4 py-3 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-sm text-[#0b1221] focus:outline-none focus:border-[#1e40af]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0b1221] mb-2">Severity Assessment</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {SEVERITIES.map((s) => {
                      const active = severity === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setSeverity(s.value)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            active
                              ? s.value === 'Critical'
                                ? 'bg-[#dc2626] text-white border-[#dc2626]'
                                : 'bg-[#0b1221] text-white border-[#0b1221]'
                              : 'bg-[#faf9f5] border-[#e2e8f0] text-[#0b1221] hover:bg-[#f2f4f8]'
                          }`}
                        >
                          <div className="text-xs font-bold">{s.label}</div>
                          <div className={`text-[11px] mt-1 leading-snug ${active ? 'text-slate-200' : 'text-[#475569]'}`}>
                            {s.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0b1221] mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#475569]" />
                      <span>Observed Date</span>
                    </label>
                    <input
                      type="date"
                      value={observedDate}
                      onChange={(e) => setObservedDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs font-mono-tabular text-[#0b1221]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0b1221] mb-1.5">Observed Time Window</label>
                    <select
                      value={observedWindow}
                      onChange={(e) => setObservedWindow(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs text-[#0b1221]"
                    >
                      <option>Morning (06:00–12:00)</option>
                      <option>Afternoon (12:00–18:00)</option>
                      <option>Evening (18:00–00:00)</option>
                      <option>Overnight (00:00–06:00)</option>
                    </select>
                  </div>
                </div>

                {/* Privacy & Reporter Identity */}
                <div className="p-4 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#0b1221]">Public Map Privacy Setting</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPublic(true)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          isPublic
                            ? 'bg-[#0b1221] text-white'
                            : 'bg-white border border-[#e2e8f0] text-[#475569] hover:text-[#0b1221]'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Public Map Marker
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPublic(false)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          !isPublic
                            ? 'bg-[#0b1221] text-white'
                            : 'bg-white border border-[#e2e8f0] text-[#475569] hover:text-[#0b1221]'
                        }`}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        Confidential Queue Only
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed">
                    Even when published to the Live City Map, your name and contact info are strictly isolated inside
                    the authenticated municipal database and stripped from all public feeds.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      placeholder="Your Name (optional, private only)"
                      className="px-3.5 py-2.5 rounded-lg bg-white border border-[#e2e8f0] text-xs text-[#0b1221]"
                    />
                    <input
                      type="text"
                      value={reporterContact}
                      onChange={(e) => setReporterContact(e.target.value)}
                      placeholder="Email or Phone for SMS updates (private)"
                      className="px-3.5 py-2.5 rounded-lg bg-white border border-[#e2e8f0] text-xs text-[#0b1221]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#e2e8f0] flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] text-[#0b1221] text-xs font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!title.trim() || !description.trim()) {
                        setSubmitError('Please provide both a headline summary and field description.');
                        return;
                      }
                      setSubmitError(null);
                      setStep(3);
                    }}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <span>Continue to Photos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: PHOTO EVIDENCE */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl text-[#0b1221]">Attach Photographic Evidence</h2>
                  <p className="text-xs text-[#475569] mt-1">
                    Upload up to 4 field images (PNG, JPEG, WebP up to 6MB). Files are hashed and stored on the server.
                  </p>
                </div>

                <div className="border-2 border-dashed border-[#cbd5e1] rounded-2xl p-8 text-center bg-[#faf9f5]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-xl bg-white border border-[#e2e8f0] flex items-center justify-center mx-auto mb-3 text-[#1e40af]">
                    {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  </div>
                  <p className="text-sm font-semibold text-[#0b1221]">
                    {uploadingPhoto ? 'Uploading to municipal evidence locker…' : 'Drop field photos or browse device'}
                  </p>
                  <p className="text-xs text-[#475569] mt-1">
                    {photoUrls.length}/4 attachments linked · SHA-256 integrity seal generated on submission
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={uploadingPhoto || photoUrls.length >= 4}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Select Photo File</span>
                    </button>
                    {photoUrls.length === 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoUrls(['/src/assets/images/civic_citizen_reporting_1794931445606.jpg'])
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-[#e2e8f0] text-[#0b1221] text-xs font-semibold hover:bg-[#f2f4f8] cursor-pointer"
                      >
                        Attach Sample Field Photo
                      </button>
                    )}
                  </div>
                </div>

                {uploadError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-[#dc2626]">
                    {uploadError}
                  </div>
                )}

                {photoUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {photoUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-[#e2e8f0] bg-[#f2f4f8]">
                        <ResilientImage src={url} alt={`Evidence photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-[#0b1221]/85 text-white flex items-center justify-center cursor-pointer"
                          aria-label="Remove photo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-[#e2e8f0] flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] text-[#0b1221] text-xs font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer"
                  >
                    <span>Pin Location &amp; Ward</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: INTERACTIVE WARD & LOCATION MAP */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl text-[#0b1221]">Confirm Location &amp; Municipal Ward</h2>
                    <p className="text-xs text-[#475569] mt-1">
                      Click anywhere on the 12-ward GIS grid to auto-identify ward jurisdiction and yard depot.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUseGpsOrCenter}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] border border-[#e2e8f0] text-[#0b1221] text-xs font-semibold cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#1e40af]" />
                    <span>Use Device GPS</span>
                  </button>
                </div>

                {/* Clickable Ward Map Canvas — Midnight Navy GIS Grid */}
                <div
                  onClick={handleMapClick}
                  className="relative w-full h-[340px] rounded-xl overflow-hidden bg-[#0b1221] border border-[#1e293b] cursor-crosshair select-none"
                  role="application"
                  aria-label="Interactive ward location picker"
                >
                  <svg className="absolute inset-0 w-full h-full text-slate-600/35 pointer-events-none">
                    <defs>
                      <pattern id="report-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeDasharray="2,4" strokeWidth="0.7" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#report-grid)" />
                    <path
                      d="M-30,175 C160,130 340,210 680,150 C880,115 1040,185 1200,160"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="12"
                      opacity="0.25"
                    />
                  </svg>

                  {wards.map((w) => {
                    const isSelected = w.id === wardId;
                    return (
                      <div
                        key={w.id}
                        style={{
                          left: `${w.mapBounds.x1}%`,
                          top: `${w.mapBounds.y1}%`,
                          width: `${Math.max(14, w.mapBounds.x2 - w.mapBounds.x1)}%`,
                          height: `${Math.max(16, w.mapBounds.y2 - w.mapBounds.y1)}%`,
                        }}
                        className={`absolute rounded-lg border transition-colors pointer-events-none flex items-center justify-center ${
                          isSelected
                            ? 'bg-[#2563eb]/20 border-[#60a5fa]'
                            : 'bg-white/[0.03] border-white/10'
                        }`}
                      >
                        <span className={`text-[10px] font-mono-tabular font-bold ${isSelected ? 'text-[#93c5fd]' : 'text-slate-400'}`}>
                          {w.code}
                        </span>
                      </div>
                    );
                  })}

                  {/* Dropped Citizen Pin */}
                  <div
                    style={{ left: `${mapX}%`, top: `${mapY}%` }}
                    className="absolute -translate-x-1/2 -translate-y-full z-20 pointer-events-none"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#dc2626] text-white flex items-center justify-center shadow-lg ring-2 ring-white">
                      <MapPin className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {geoMessage && (
                  <div className="text-xs font-medium text-[#1e40af] bg-[#dbeafe]/55 border border-[#93c5fd]/40 px-3.5 py-2.5 rounded-lg">
                    {geoMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#0b1221] mb-1.5">Identified Ward</label>
                    <select
                      value={wardId}
                      onChange={(e) => {
                        const w = wards.find((x) => x.id === e.target.value);
                        setWardId(e.target.value);
                        if (w) {
                          setMapX(w.mapBounds.centerX);
                          setMapY(w.mapBounds.centerY);
                          setLat(w.mapBounds.lat);
                          setLng(w.mapBounds.lng);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs font-semibold text-[#0b1221]"
                    >
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0b1221] mb-1.5">Nearest Street / Landmark</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#faf9f5] border border-[#e2e8f0] text-xs text-[#0b1221]"
                    />
                  </div>
                </div>

                {selectedWard && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#f2f4f8] border border-[#e2e8f0] text-xs">
                    <div>
                      <span className="text-[#475569] block text-[11px]">Alderperson</span>
                      <span className="font-bold text-[#0b1221]">{selectedWard.alderperson || 'District Representative'}</span>
                    </div>
                    <div>
                      <span className="text-[#475569] block text-[11px]">Operating Depot</span>
                      <span className="font-bold text-[#0b1221]">{selectedWard.depot || 'Central Yard'}</span>
                    </div>
                    <div>
                      <span className="text-[#475569] block text-[11px]">Coordinates</span>
                      <span className="font-mono-tabular font-bold text-[#0b1221]">
                        {lat.toFixed(4)}, {lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}

                {nearbyExistingIssues.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                    <div className="font-bold text-amber-950 mb-1">
                      {nearbyExistingIssues.length} active {selectedCat.mappedCategory} issue(s) already tracked in{' '}
                      {selectedWard?.code}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {nearbyExistingIssues.slice(0, 3).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onNavigate('/track', `id=${encodeURIComponent(c.id)}`)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-mono-tabular font-semibold hover:bg-amber-100 cursor-pointer"
                        >
                          #{c.id} · {c.title.slice(0, 28)}…
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-[#e2e8f0] flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] text-[#0b1221] text-xs font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer"
                  >
                    <span>Review Final Docket</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: REVIEW & SUBMIT */}
            {step === 5 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl text-[#0b1221]">Verify Submission Docket</h2>
                  <p className="text-xs text-[#475569] mt-1">
                    Confirm details prior to automated municipal routing and SLA countdown activation.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-[#faf9f5] border border-[#e2e8f0] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#e2e8f0]">
                    <span className="text-xs font-bold text-[#1e40af]">
                      {selectedCat.label} · {selectedCat.mappedCategory}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        severity === 'Critical' ? 'text-[#dc2626]' : 'text-[#0b1221]'
                      }`}
                    >
                      {severity} Priority
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0b1221]">{title}</h3>
                    <p className="text-sm text-[#475569] mt-1 leading-relaxed">{description}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-3 border-t border-[#e2e8f0]">
                    <div>
                      <span className="text-[#475569] block">Ward &amp; Address</span>
                      <span className="font-semibold text-[#0b1221]">
                        {selectedWard?.code} · {address}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#475569] block">Observed Window</span>
                      <span className="font-semibold text-[#0b1221]">
                        {observedDate} · {observedWindow}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#475569] block">Public Visibility</span>
                      <span className="font-semibold text-[#0b1221]">
                        {isPublic ? 'Published on Live City Map (Anonymous)' : 'Confidential Administrative Queue'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#475569] block">Attached Field Evidence</span>
                      <span className="font-semibold text-[#0b1221]">{photoUrls.length} verified photo(s)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#e2e8f0] flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#f2f4f8] hover:bg-[#e8ecf2] text-[#0b1221] text-xs font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Edit Location</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Routing &amp; Issuing Ticket…</span>
                      </>
                    ) : (
                      <>
                        <FileCheck2 className="w-4 h-4" />
                        <span>Dispatch Official Report</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Context Rail: Routing Preview & SLA Guarantee */}
          <aside className="lg:col-span-4 space-y-5">
            <div className="bg-[#f2f4f8] border border-[#e2e8f0] rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#475569]">
                <BadgeCheck className="w-4 h-4 text-[#1e40af]" />
                <span>Automated Dispatch Preview</span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-white border border-[#e2e8f0]">
                  <span className="text-[#475569] block text-[11px]">Target Municipal Bureau</span>
                  <span className="font-bold text-[#0b1221] text-sm mt-0.5 block">
                    {selectedCat.mappedCategory}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-[#e2e8f0]">
                  <span className="text-[#475569] block text-[11px]">Ordinance SLA Clock</span>
                  <span className="font-mono-tabular font-bold text-[#0b1221] text-sm mt-0.5 block">
                    {matchedSlaPolicy ? `${matchedSlaPolicy.targetHours} Hours Resolution Window` : '24 Hours Standard'}
                  </span>
                  <span className="text-[11px] text-[#475569] block mt-1">
                    Supervisor Tier 2 triggers at {matchedSlaPolicy?.warningThresholdPct ?? 75}% critical burn or breach.
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-[#e2e8f0]">
                  <span className="text-[#475569] block text-[11px]">Selected Jurisdiction</span>
                  <span className="font-bold text-[#0b1221] text-sm mt-0.5 block">
                    {selectedWard ? `${selectedWard.code} · ${selectedWard.name}` : 'Ward 04'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#0b1221] text-white border border-[#1e293b] rounded-2xl p-6 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#93c5fd]">
                Citizen Protection
              </span>
              <h3 className="font-display text-xl text-white">No Silent Closures</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Municipal inspectors cannot mark an issue Closed without documented field resolution notes and
                photographic verification, followed by your optional 5-star review.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
