'use client';
import { useEffect, useState } from 'react';
import { supabase, supabaseReady } from '@/lib/supabase';

type Session = { id: string; session_date: string; start_time: string; end_time: string; location: string; capacity: number; price: number; status: string };
type Booking = { id: string; booking_code: string; session_id: string; name: string; whatsapp: string; status: string; amount: number; payment_method: string | null; proof_path: string | null; hold_expires_at: string; created_at: string };
type Setting = { bank_name: string; bank_account: string; bank_holder: string; gopay_number: string; whatsapp_number: string };
const rupiah = (n: number) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const dateText = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
export default function Home() {
  const [session, setSession] = useState<Session | null>(null), [bookings, setBookings] = useState<Booking[]>([]), [settings, setSettings] = useState<Setting | null>(null);
  const [name, setName] = useState(''), [wa, setWa] = useState(''), [checkout, setCheckout] = useState<Booking | null>(null);
  const [method, setMethod] = useState(''), [sender, setSender] = useState(''), [proof, setProof] = useState<File | null>(null);
  const [owner, setOwner] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [pending, setPending] = useState<Booking[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [ownerSessions, setOwnerSessions] = useState<Session[]>([]);
const [savingSession, setSavingSession] = useState(false);
const [sessionDate, setSessionDate] = useState('');
const [sessionStart, setSessionStart] = useState('19:00');
const [sessionEnd, setSessionEnd] = useState('22:00');
const [sessionLocation, setSessionLocation] = useState('GOR Cikeruh');
const [sessionCapacity, setSessionCapacity] = useState('22');
const [sessionPrice, setSessionPrice] = useState('15000');
const [editingSession, setEditingSession] = useState<Session | null>(null);
const [editDate, setEditDate] = useState('');
const [editStart, setEditStart] = useState('19:00');
const [editEnd, setEditEnd] = useState('22:00');
const [editLocation, setEditLocation] = useState('GOR Cikeruh');
const [editCapacity, setEditCapacity] = useState('22');
const [editPrice, setEditPrice] = useState('15000');
const [sessionView, setSessionView] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');

const [ownerName, setOwnerName] = useState('');
const [ownerAmount, setOwnerAmount] = useState('15000');
const [addingOwnerBooking, setAddingOwnerBooking] = useState(false);

  const notify = (s: string) => setMessage(s);
  async function refresh() {
    if (!supabase) {
      notify('Supabase belum tersambung. Periksa .env.local');
      return;
    }

    // Ambil sesi badminton
    const { data: s, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'OPEN')
      .order('session_date')
      .limit(1)
      .maybeSingle();

    if (sessionError) {
  const detail = [
    sessionError.message,
    sessionError.code,
    sessionError.details,
    sessionError.hint
  ].filter(Boolean).join(' | ');

  notify('SESSION ERROR: ' + (detail || 'Detail error tidak tersedia'));
} else {
  setSession(s as Session | null);
}

// Ambil semua sesi untuk Dashboard Owner
const { data: allSessions, error: allSessionsError } = await supabase
  .from('sessions')
  .select('*')
  .order('session_date', { ascending: false });

if (allSessionsError) {
  notify('Gagal mengambil daftar sesi: ' + allSessionsError.message);
} else {
  setOwnerSessions((allSessions || []) as Session[]);
}

    // Ambil peserta yang sudah lunas
    const { data: b, error: bookingError } = await supabase
      .from('public_paid_bookings')
      .select('*')
      .order('paid_at');

    if (bookingError) {
      notify(
        'BOOKING: ' +
        [
          bookingError.message,
          bookingError.code,
          bookingError.details,
          bookingError.hint
        ].filter(Boolean).join(' | ')
      );
    } else {
      setBookings((b || []) as Booking[]);
    }

    // Ambil pengaturan pembayaran
    const { data: st, error: settingsError } = await supabase
      .from('settings')
      .select('bank_name,bank_account,bank_holder,gopay_number,whatsapp_number')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      notify(
        'SETTINGS: ' +
        [
          settingsError.message,
          settingsError.code,
          settingsError.details,
          settingsError.hint
        ].filter(Boolean).join(' | ')
      );
    } else {
      setSettings(st as Setting | null);
    }
  }

  async function openOwnerSession() {
  if (!supabase) return notify('Supabase belum tersambung.');

  if (!sessionDate) {
    return notify('Pilih tanggal sesi terlebih dahulu.');
  }

  if (Number(sessionCapacity) < 1) {
    return notify('Kuota minimal 1 orang.');
  }

  setSavingSession(true);

  const { error } = await supabase.rpc('owner_open_session', {
    p_session_date: sessionDate,
    p_start_time: sessionStart,
    p_end_time: sessionEnd,
    p_location: sessionLocation.trim(),
    p_capacity: Number(sessionCapacity),
    p_price: Number(sessionPrice),
  });

  setSavingSession(false);

  if (error) {
    return notify('Gagal membuka sesi: ' + error.message);
  }

  notify('Sesi berhasil dibuka!');
  setSessionDate('');
  await refresh();
}

  async function updateOwnerSession(s: Session, status: 'OPEN' | 'CLOSED', capacity = s.capacity) {
    if (!supabase) return notify('Supabase belum tersambung.');
    if (!owner) return notify('Login Owner terlebih dahulu.');
    setSavingSession(true);
    const { error } = await supabase.rpc('owner_update_session', {
      p_session_id: s.id,
      p_status: status,
      p_capacity: capacity,
    });
    setSavingSession(false);
    if (error) return notify('Gagal memperbarui sesi: ' + error.message);
    notify(status === 'OPEN' ? 'Sesi berhasil dibuka.' : 'Sesi berhasil ditutup.');
    await refresh();
  }

  function startEditSession(s: Session) {
    setEditingSession(s);
    setEditDate(s.session_date);
    setEditStart(s.start_time.slice(0, 5));
    setEditEnd(s.end_time.slice(0, 5));
    setEditLocation(s.location);
    setEditCapacity(String(s.capacity));
    setEditPrice(String(s.price));
  }

  async function saveEditedSession() {
    if (!supabase || !editingSession) return;
    if (!editDate || !editLocation.trim()) return notify('Tanggal dan lokasi wajib diisi.');
    if (editStart >= editEnd) return notify('Jam selesai harus setelah jam mulai.');
    if (Number(editCapacity) < 1 || Number(editPrice) < 0) return notify('Kuota atau harga tidak valid.');

    setSavingSession(true);
    const { error } = await supabase.rpc('owner_edit_session', {
      p_session_id: editingSession.id,
      p_session_date: editDate,
      p_start_time: editStart,
      p_end_time: editEnd,
      p_location: editLocation.trim(),
      p_capacity: Number(editCapacity),
      p_price: Number(editPrice),
    });
    setSavingSession(false);
    if (error) return notify('Gagal mengedit sesi: ' + error.message);
    setEditingSession(null);
    notify('Sesi berhasil diperbarui.');
    await refresh();
  }

  async function archiveOwnerSession(s: Session) {
    if (!supabase) return notify('Supabase belum tersambung.');
    if (s.status === 'OPEN') return notify('Tutup sesi terlebih dahulu sebelum mengarsipkan.');
    const confirmed = window.confirm(`Arsipkan sesi ${dateText(s.session_date)}? Riwayat peserta dan pembayaran tetap disimpan.`);
    if (!confirmed) return;
    setSavingSession(true);
    const { error } = await supabase.rpc('owner_archive_session', { p_session_id: s.id });
    setSavingSession(false);
    if (error) return notify('Gagal mengarsipkan sesi: ' + error.message);
    notify('Sesi berhasil diarsipkan.');
    await refresh();
  }

  useEffect(() => { refresh(); const t = setInterval(() => { refresh(); }, 12000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => setOwner(!!data.session)); const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setOwner(!!s)); return () => sub.subscription.unsubscribe() }, []);
  async function createBooking() {
    if (!supabase) return notify('Supabase belum disambungkan. Isi .env.local dahulu.');
    if (!name.trim() || !wa.trim()) return notify('Isi nama dan WhatsApp.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_booking_hold', { p_name: name.trim(), p_whatsapp: wa.trim() });
    setBusy(false);
    if (error) return notify(error.message);
    const b = data as Booking; setCheckout(b); notify('Slot berhasil di-hold selama 10 menit.');
  }
  async function sendProof() {
    if (!supabase || !checkout) return;
    if (!method || !sender.trim() || !proof) return notify('Lengkapi metode, nama pengirim, dan bukti pembayaran.');
    if (proof.size > 5 * 1024 * 1024) return notify('Ukuran bukti maksimal 5 MB.');
    setBusy(true);
    const ext = (proof.name.split('.').pop() || 'jpg').toLowerCase(), path = `${checkout.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('payment-proofs').upload(path, proof, { upsert: false, contentType: proof.type });
    if (upErr) { setBusy(false); return notify(upErr.message) }
    const { error } = await supabase.rpc('submit_payment_proof', { p_booking_id: checkout.id, p_method: method, p_sender: sender.trim(), p_proof_path: path });
    setBusy(false);
    if (error) return notify(error.message);
    setCheckout(null); notify('Bukti pembayaran berhasil dikirim. Menunggu verifikasi Owner.'); refresh();
  }
  async function ownerLogin() {
    if (!supabase) return notify('Supabase belum disambungkan.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return notify(error.message);
    const { data } = await supabase.rpc('is_owner'); if (!data) { await supabase.auth.signOut(); return notify('Akun ini bukan Owner.') }
    setOwner(true); notify('Login Owner berhasil.'); loadPending();
  }
  async function loadPending()
  
  
  { if (!supabase) return; const { data, error } = await supabase.from('bookings').select('*').eq('status', 'MENUNGGU_VERIFIKASI').order('created_at'); if (error) notify(error.message); setPending((data || []) as Booking[]) }

  async function openPayments() {
  await loadPending();

  const target = document.getElementById('owner-payments');

  if (!target) {
    return notify('Daftar pembayaran tidak ditemukan!');
  }

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}
  async function viewProof(path: string) { if (!supabase) return; const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 90); if (error) return notify(error.message); window.open(data.signedUrl, '_blank', 'noopener,noreferrer') }
  async function verify(id: string) { if (!supabase) return; const { error } = await supabase.rpc('owner_verify_booking', { p_booking_id: id }); if (error) return notify(error.message); notify('Booking dikonfirmasi LUNAS.'); loadPending(); refresh() }
  async function signOut() { await supabase?.auth.signOut(); setOwner(false) }

async function addOwnerBooking() {
  if (!supabase) return notify('Supabase belum tersambung.');
  if (!owner) return notify('Login Owner terlebih dahulu.');
  if (!session) return notify('Belum ada sesi badminton.');

  const cleanName = ownerName.trim();
  const amount = Number(ownerAmount);

  if (!cleanName) {
  return notify('Nama peserta wajib diisi.');
}

  if (![0, 15000].includes(amount)) {
    return notify('Pilih GRATIS atau Rp15.000.');
  }

  setAddingOwnerBooking(true);

  const { error } = await supabase.rpc('owner_add_booking', {
    p_session_id: session.id,
    p_name: cleanName,
    p_whatsapp: '',
    p_amount: amount
  });

  setAddingOwnerBooking(false);

  if (error) return notify(error.message);

  setOwnerName('');
  setOwnerAmount('15000');

  notify('Peserta berhasil ditambahkan!');
  await refresh();
  await loadPending();
}

  const sessionBookings = session ? bookings.filter((b) => b.session_id === session.id) : [];
  const occupied = sessionBookings.length;
  const available = session ? Math.max(0, session.capacity - occupied) : 0;
  const percent = session && session.capacity > 0 ? Math.min(100, (occupied / session.capacity) * 100) : 0;
  const own = owner;
  const visibleOwnerSessions = ownerSessions.filter((s) =>
    sessionView === 'ARCHIVED' ? s.status === 'ARCHIVED' : s.status !== 'ARCHIVED'
  );
  const activeSessionCount = ownerSessions.filter((s) => s.status !== 'ARCHIVED').length;
  const archivedSessionCount = ownerSessions.filter((s) => s.status === 'ARCHIVED').length;
  if (!supabaseReady) return <main className="page"><header className="top"><div className="brand">BADMINGTONG</div></header><section className="panel setup"><p className="eyebrow">ONLINE SETUP</p><h1>Hubungkan Supabase dulu.</h1><p>Buat project Supabase, jalankan SQL di folder <code>supabase/schema.sql</code>, lalu salin URL dan publishable/anon key ke file <code>.env.local</code>.</p><p>Lihat README untuk panduan tahap demi tahap. Jangan pernah memasukkan service-role key ke browser.</p></section></main>;
  return <main className="page">
    <header className="top"><div className="brand"><span className="ball">🏸</span> BADMINGTONG</div>
<div className="top-actions">
  {own ? (
    <>
      <button
        className="ghost"
        onClick={openPayments}
      >
        PESERTA & PEMBAYARAN
      </button>

      <button
        className="ghost"
        onClick={signOut}
      >
        KELUAR OWNER
      </button>
    </>
  ) : (
    <button
      className="ghost"
      onClick={() =>
        document.getElementById('owner-login')?.scrollIntoView({
          behavior: 'smooth'
        })
      }
    >
      OWNER LOGIN
    </button>
  )}
</div>

</header>
    <div className="hero-grid"><section className="panel hero"><p className="eyebrow">BADMINTON THURSDAY</p><h1>Gas main.<br /><span>Slot terbatas.</span></h1><p>Booking pemain untuk sesi badminton. First come, first served — bayar {rupiah(session?.price || 15000)} untuk mengamankan slot.</p><div className="metrics"><div><b>{occupied}</b><small>Sudah booking</small></div><div><b>{available}</b><small>Sisa slot</small></div><div><b>{rupiah(session?.price || 15000)}</b><small>Per pemain</small></div></div></section>
      <section className="panel next"><p className="eyebrow">NEXT SESSION</p><h2>{session ? dateText(session.session_date) : 'Belum ada sesi'}</h2><p>{session ? `${session.start_time.slice(0, 5)}–${session.end_time.slice(0, 5)} · ${session.location}` : 'Owner belum membuat sesi OPEN.'}</p><div className="bar"><i style={{ width: `${percent}%` }} /></div><div className="progress"><span>{occupied} / {session?.capacity || 0} terisi</span><span>{available} slot tersedia</span></div></section></div>
    {!own ? <><section className="panel booking"><h2>Booking pemain</h2><div className="fields"><label>Nama<input value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Lazio" maxLength={80} /></label><label>WhatsApp<input value={wa} onChange={e => setWa(e.target.value)} placeholder="08xxxxxxxxxx" maxLength={25} /></label></div><button className="primary wide" disabled={busy || !session || available < 1} onClick={createBooking}>{busy ? 'MEMPROSES...' : `BOOKING & LANJUT BAYAR — ${rupiah(session?.price || 15000)}`}</button><p className="hint">Slot di-hold 10 menit setelah booking dibuat.</p></section></> : null}
    {own && pending.length > 0 ? <section className="panel booking"><h2>Pembayaran menunggu verifikasi</h2>{pending.map(b => <div className="pending" key={b.id}><div><b>{b.name}</b><small>{b.booking_code} · {b.whatsapp} · {rupiah(b.amount)}</small>{b.proof_path ? <button className="ghost" onClick={() => viewProof(b.proof_path!)}>LIHAT BUKTI</button> : <small>Bukti belum tersedia</small>}</div><button className="primary" onClick={() => verify(b.id)}>LUNAS</button></div>)}</section> : null}
    
<section className="panel participants" id="owner-payments">
  <h2>Daftar pemain & status pembayaran</h2>
  {sessionBookings.length ? sessionBookings.map((b, i) => (
    <div className="player" key={b.id}>
      <span>{i + 1}</span>
      <b>{b.name}</b>
      <em>
        {b.status === 'MENUNGGU_VERIFIKASI'
  ? 'MENUNGGU VERIFIKASI'
  : b.status === 'GRATIS' && !owner
  ? 'LUNAS'
  : b.status}
      </em>
    </div>
  )) : (
    <p className="hint">
      Belum ada pemain yang terdaftar.
    </p>
  )}
</section>

    <footer>BADMINGTONG · PLAY • CONNECT • REPEAT</footer>
    {own ? null : <section className="owner-login" id="owner-login"><details><summary>Owner login</summary><div className="fields"><label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" /></label><label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" /></label></div><button className="primary" onClick={ownerLogin}>MASUK OWNER</button></details></section>}
    
{own ? (
  <section className="panel booking">
    <h2>Dashboard Owner</h2>

    <h3>Kelola Sesi</h3>
    <p className="hint">
      Buat sesi mingguan. Member hanya bisa booking ketika sesi berstatus OPEN.
    </p>

    <div className="fields">
      <label>
        Tanggal sesi
        <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
      </label>
      <label>
        Jam mulai
        <input type="time" value={sessionStart} onChange={e => setSessionStart(e.target.value)} />
      </label>
      <label>
        Jam selesai
        <input type="time" value={sessionEnd} onChange={e => setSessionEnd(e.target.value)} />
      </label>
      <label>
        Lokasi
        <input value={sessionLocation} onChange={e => setSessionLocation(e.target.value)} />
      </label>
      <label>
        Kuota awal
        <input type="number" min="1" value={sessionCapacity} onChange={e => setSessionCapacity(e.target.value)} />
      </label>
      <label>
        Harga booking
        <input type="number" min="0" value={sessionPrice} onChange={e => setSessionPrice(e.target.value)} />
      </label>
    </div>
    <button className="primary wide" disabled={savingSession} onClick={openOwnerSession}>
      {savingSession ? 'MENYIMPAN...' : 'BUKA SESI BARU'}
    </button>



<p className="hint">
  Buka, tutup, dan atur kapasitas sesi badminton.
</p>

<div className="fields">
  <button
    type="button"
    className={sessionView === 'ACTIVE' ? 'primary' : 'ghost'}
    onClick={() => setSessionView('ACTIVE')}
  >
    SESI AKTIF ({activeSessionCount})
  </button>
  <button
    type="button"
    className={sessionView === 'ARCHIVED' ? 'primary' : 'ghost'}
    onClick={() => setSessionView('ARCHIVED')}
  >
    ARSIP ({archivedSessionCount})
  </button>
</div>

{visibleOwnerSessions.length > 0 ? (
  visibleOwnerSessions.map((s) => (
    <div className="player" key={s.id}>
      <div>
        <b>
          {new Date(s.session_date + 'T00:00:00').toLocaleDateString(
            'id-ID',
            {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            }
          )}
        </b>
        <p className="hint">
          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.location}
        </p>
        <p className="hint">
          Kuota: {s.capacity} orang · Status: {s.status}
        </p>
        <div className="fields">
          {s.status !== 'ARCHIVED' ? (
            <>
              <button
                className="ghost"
                disabled={savingSession}
                onClick={() => updateOwnerSession(s, s.status === 'OPEN' ? 'CLOSED' : 'OPEN')}
              >
                {s.status === 'OPEN' ? 'TUTUP SESI' : 'BUKA KEMBALI'}
              </button>
              <button
                className="ghost"
                disabled={savingSession}
                onClick={() => updateOwnerSession(s, 'OPEN', s.capacity + 2)}
              >
                TAMBAH 2 SLOT
              </button>
              <button className="ghost" disabled={savingSession} onClick={() => startEditSession(s)}>
                EDIT SESI
              </button>
              <button
                className="ghost"
                disabled={savingSession || s.status === 'OPEN'}
                onClick={() => archiveOwnerSession(s)}
              >
                ARSIPKAN
              </button>
            </>
          ) : (
            <span className="hint">Sesi sudah diarsipkan.</span>
          )}
        </div>
      </div>
    </div>
  ))
) : (
  <p className="hint">
    {sessionView === 'ARCHIVED' ? 'Belum ada sesi yang diarsipkan.' : 'Belum ada sesi aktif.'}
  </p>
)}

    <h3>Tambah Peserta Manual</h3>

    <div className="fields">
      <label>
        Nama Peserta
        <input
          type="text"
          value={ownerName}
          onChange={e => setOwnerName(e.target.value)}
          placeholder="Masukkan nama peserta"
        />
      </label>

      <label>
        Pembayaran
        <select
          value={ownerAmount}
          onChange={e => setOwnerAmount(e.target.value)}
        >
          <option value="0">GRATIS — Rp0</option>
          <option value="15000">LUNAS — Rp15.000</option>
        </select>
      </label>
    </div>

    <button
      className="primary wide"
      disabled={addingOwnerBooking}
      onClick={addOwnerBooking}
    >
      {addingOwnerBooking ? 'MENAMBAHKAN...' : '+ TAMBAH PESERTA'}
    </button>

    <button
      className="ghost wide"
      onClick={loadPending}
    >
      MUAT ULANG PEMBAYARAN
    </button>
  </section>
) : null}

    {editingSession ? (
      <div className="modal">
        <section className="panel checkout">
          <button className="ghost close" onClick={() => setEditingSession(null)}>TUTUP</button>
          <p className="eyebrow">KELOLA SESI</p>
          <h2>Edit Sesi</h2>
          <div className="fields">
            <label>Tanggal sesi<input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} /></label>
            <label>Jam mulai<input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} /></label>
            <label>Jam selesai<input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} /></label>
            <label>Lokasi<input value={editLocation} onChange={e => setEditLocation(e.target.value)} /></label>
            <label>Kuota<input type="number" min="1" value={editCapacity} onChange={e => setEditCapacity(e.target.value)} /></label>
            <label>Harga<input type="number" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} /></label>
          </div>
          <button className="primary wide" disabled={savingSession} onClick={saveEditedSession}>
            {savingSession ? 'MENYIMPAN...' : 'SIMPAN PERUBAHAN'}
          </button>
        </section>
      </div>
    ) : null}
    {checkout ? <div className="modal"><section className="panel checkout"><button className="ghost close" onClick={() => setCheckout(null)}>TUTUP</button><p className="eyebrow">CHECKOUT · HOLD 10 MENIT</p><h2>{checkout.booking_code}</h2><h1>{rupiah(checkout.amount)}</h1><div className="accounts"><div><small>TRANSFER BANK</small><b>{settings?.bank_name || 'Atur di Supabase settings'}</b><strong>{settings?.bank_account || '—'}</strong><small>a.n. {settings?.bank_holder || '—'}</small></div><div><small>GOPAY</small><strong>{settings?.gopay_number || '—'}</strong></div></div><label>Metode<select value={method} onChange={e => setMethod(e.target.value)}><option value="">Pilih metode</option><option>Transfer Bank</option><option>GoPay</option></select></label><label>Nama pengirim<input value={sender} onChange={e => setSender(e.target.value)} /></label><label>Bukti pembayaran<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setProof(e.target.files?.[0] || null)} /></label><button className="primary wide" disabled={busy} onClick={sendProof}>{busy ? 'MENGIRIM...' : 'SAYA SUDAH BAYAR — KIRIM BUKTI'}</button></section></div> : null}
    {message ? <div className="toast" onClick={() => setMessage('')}>{message} ×</div> : null}
  </main>;
}
