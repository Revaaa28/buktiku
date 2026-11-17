// Built-in sample claim/source pairs for BuktiKu.
//
// Each pair plants specific mismatches that the deterministic engine is
// expected to catch (the tests assert exactly this):
//
//  (a) scholarship — the viral summary ALTERS the amount
//      (Rp 15,000,000 vs Rp 10,000,000) and DROPS two conditions
//      (minimum GPA 3.50, East Kalimantan residency).
//  (b) receipt — the reimbursement claim states a total (Rp 45,000)
//      that contradicts the receipt total (Rp 30,000).
//  (c) job posting — the recruiter pitch inflates the salary
//      (Rp 12,000,000 vs Rp 8,000,000), moves the deadline
//      (15 January 2027 vs 15 December 2026) and drops the
//      2-years-of-experience requirement.
//  (d) beasiswa-id — the same scholarship story fully in Bahasa
//      Indonesia: the broadcast writes the amount in word form
//      ("Rp 15 juta") and drops the IPK condition; the announcement
//      uses Indonesian formats (Rp 10.000.000, IPK 3,50, Desember).

export const SAMPLES = [
  {
    id: 'scholarship',
    label: 'Scholarship: announcement vs viral summary',
    claim:
      'Viral news! The Cendekia Foundation is giving away 50 scholarships of ' +
      'Rp 15,000,000 per semester for Universitas Nusantara students. Anyone ' +
      'can apply — no GPA requirement, everyone is welcome! Apply by ' +
      '30 November 2026.',
    source:
      'Beasiswa Cendekia 2026 — official announcement. The Cendekia Foundation ' +
      'offers 50 scholarships of Rp 10,000,000 per semester for students of ' +
      'Universitas Nusantara. Applicants must have a minimum GPA of 3.50. ' +
      'Applicants must be residents of East Kalimantan. Applications close ' +
      'on 30 November 2026.',
  },
  {
    id: 'receipt',
    label: 'Receipt vs reimbursement claim',
    claim:
      'Reimbursement request — lunch at Warung Kopi Sederhana on ' +
      '12 November 2026. I had Nasi Campur and Es Teh Manis. Total was ' +
      'Rp 45,000, paid by card. Please reimburse.',
    source:
      'Warung Kopi Sederhana — official receipt. Date: 12 November 2026. ' +
      'Nasi Campur Rp 25,000. Es Teh Manis Rp 5,000. Total paid: ' +
      'Rp 30,000, cash.',
  },
  {
    id: 'job',
    label: 'Job posting vs recruiter pitch',
    claim:
      'Exciting news! PT Sinar Tech is hiring a Junior Analyst in ' +
      'Jakarta — salary Rp 12,000,000 per month, fresh graduates welcome, ' +
      'no experience needed! Apply before 15 January 2027.',
    source:
      'PT Sinar Tech — official job posting. Position: Junior Analyst, ' +
      'based in Jakarta. Salary: Rp 8,000,000 per month. Requirements: ' +
      "a bachelor's degree and at least 2 years of experience. Apply via " +
      'the PT Sinar Tech careers page before 15 December 2026.',
  },
  {
    id: 'beasiswa-id',
    label: 'Beasiswa: pengumuman resmi vs broadcast viral (Bahasa Indonesia)',
    claim:
      'Kabar gembira! Yayasan Cendekia membagikan 50 beasiswa senilai ' +
      'Rp 15 juta per semester untuk mahasiswa Universitas Nusantara. ' +
      'Semua boleh daftar, tanpa syarat IPK! Paling lambat 5 Desember 2026.',
    source:
      'Beasiswa Cendekia 2026 — pengumuman resmi. Yayasan Cendekia ' +
      'menyediakan 50 beasiswa sebesar Rp 10.000.000 per semester bagi ' +
      'mahasiswa Universitas Nusantara. Pendaftar wajib memiliki IPK ' +
      'minimal 3,50. Pendaftaran ditutup 5 Desember 2026.',
  },
];
