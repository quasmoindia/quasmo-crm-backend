import { Lead } from '../models/Lead.js';
import { User } from '../models/User.js';
import type { LeadStatus, LeadSource } from '../models/Lead.js';

/** Sample leads for microscope sales – only the 4 statuses: new, contacted, proposal, closed (~20) */
const SAMPLE_LEADS: {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  status: LeadStatus;
  source?: LeadSource;
  notes?: string;
}[] = [
  { name: 'Dr. Rajesh Kumar', phone: '+91 98765 43210', email: 'rajesh.k@labs.in', company: 'City Pathology Lab', status: 'new', source: 'website', notes: 'Inquiry for clinical microscope – lab use.' },
  { name: 'Priya Sharma', phone: '+91 91234 56789', email: 'priya.s@medcollege.ac.in', company: 'Govt Medical College', status: 'contacted', source: 'referral', notes: 'Callback done. Needs demo for teaching lab.' },
  { name: 'Amit Patel', phone: '+91 99887 76655', email: 'amit.p@research.org', company: 'Institute of Life Sciences', status: 'proposal', source: 'cold_call', notes: 'Quote sent for research-grade microscope.' },
  { name: 'Sneha Reddy', phone: '+91 98765 12340', email: 'sneha.r@school.edu', company: 'Delhi Public School', status: 'closed', source: 'campaign', notes: 'Order placed – 5 units for biology lab.' },
  { name: 'Vikram Singh', phone: '+91 87654 32109', email: 'vikram.s@hospital.com', company: 'Apollo Diagnostics', status: 'new', source: 'website', notes: 'Enquiry for pathology microscopes.' },
  { name: 'Dr. Anita Desai', phone: '+91 76543 21098', company: 'Private Clinic', status: 'contacted', source: 'referral', notes: 'Demo scheduled next week.' },
  { name: 'Kiran Nair', phone: '+91 65432 10987', email: 'kiran.n@univ.ac.in', company: 'State University', status: 'proposal', source: 'cold_call', notes: 'Negotiating bulk order for 10 units.' },
  { name: 'Meera Iyer', phone: '+91 54321 09876', email: 'meera.i@pharma.co', company: 'Pharma QC Lab', status: 'closed', source: 'referral', notes: 'Won – 3 units delivered last month.' },
  { name: 'Rahul Verma', phone: '+91 43210 98765', email: 'rahul.v@vetcollege.gov.in', company: 'Veterinary College', status: 'new', source: 'website', notes: 'Wants quote for dissection microscopes.' },
  { name: 'Dr. Kavita Nair', phone: '+91 32109 87654', email: 'kavita.n@bloodbank.org', company: 'Regional Blood Bank', status: 'contacted', source: 'campaign', notes: 'Follow-up call next Tuesday.' },
  { name: 'Suresh Menon', phone: '+91 21098 76543', company: 'Industrial Testing Lab', status: 'proposal', source: 'cold_call', notes: 'Metallurgy microscope – quote under review.' },
  { name: 'Lakshmi Iyer', phone: '+91 10987 65432', email: 'lakshmi.i@schools.edu', company: 'Kendriya Vidyalaya', status: 'closed', source: 'referral', notes: '2 units for science lab – delivered.' },
  { name: 'Arun Joshi', phone: '+91 98761 23456', email: 'arun.j@biotech.in', company: 'Biotech Startup', status: 'new', source: 'website', notes: 'Research microscope for cell culture lab.' },
  { name: 'Neha Gupta', phone: '+91 87652 34567', email: 'neha.g@dentalcollege.ac.in', company: 'Dental College', status: 'contacted', source: 'referral', notes: 'Demo requested for histology lab.' },
  { name: 'Pradeep Rao', phone: '+91 76543 45678', email: 'pradeep.r@forensic.gov.in', company: 'Forensic Science Lab', status: 'proposal', source: 'cold_call', notes: 'Comparison microscopes – awaiting approval.' },
  { name: 'Divya Krishnan', phone: '+91 65432 56789', company: 'Private Hospital', status: 'closed', source: 'campaign', notes: 'Pathology dept – 4 units ordered.' },
  { name: 'Ravi Shankar', phone: '+91 54321 67890', email: 'ravi.s@agri.univ.ac.in', company: 'Agriculture University', status: 'new', source: 'website', notes: 'Soil and plant microscopy – enquiry.' },
  { name: 'Anjali Deshmukh', phone: '+91 43216 78901', email: 'anjali.d@pharma.co', company: 'Generic Pharma Ltd', status: 'contacted', source: 'cold_call', notes: 'QC lab expansion – interested in 6 units.' },
  { name: 'Manoj Tiwari', phone: '+91 32107 89012', company: 'Polytechnic College', status: 'proposal', source: 'referral', notes: 'Engineering materials lab – quote sent.' },
  { name: 'Swati Pillai', phone: '+91 21098 90123', email: 'swati.p@hospital.in', company: 'Multi-speciality Hospital', status: 'closed', source: 'campaign', notes: 'Lab upgrade – 2 research microscopes won.' },
];

export async function seedLeadsIfNeeded(): Promise<void> {
  const count = await Lead.countDocuments();
  if (count > 0) return;

  const createdBy = await User.findOne().select('_id').lean();
  if (!createdBy) {
    console.log('Skipping lead seed: no users in database. Seed users first.');
    return;
  }

  const assignable = await User.find().select('_id').limit(3).lean();
  const assignableIds = assignable.map((u) => u._id);

  for (let i = 0; i < SAMPLE_LEADS.length; i++) {
    const item = SAMPLE_LEADS[i]!;
    await Lead.create({
      ...item,
      createdBy: createdBy._id,
      assignedTo: assignableIds[i % assignableIds.length],
    });
  }

  console.log('Seeded sample leads:', SAMPLE_LEADS.length);
}
