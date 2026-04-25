import type { Category, Currency } from '@prisma/client';

interface SeedDonor {
  donorName: string;
  amount: number;
  currency: Currency;
  message?: string;
  isAnonymous: boolean;
  avatarUrl?: string;
  createdAt: string;
}

interface SeedCampaign {
  slug: string;
  title: string;
  creatorName: string;
  creatorAvatar: string;
  category: Category;
  shortDescription: string;
  fullDescription: string;
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  daysLeft: number;
  coverImage: string;
  isTrending?: boolean;
  recentDonors: SeedDonor[];
}

export const seedPlatformStats = {
  totalRaised: 2540000,
  campaignsFunded: 152,
  totalDonors: 3420,
  communitiesHelped: 48,
  totalPlatformTips: 0
};

export const seedCampaigns: SeedCampaign[] = [
  {
    slug: 'rebuild-brikama-market-stalls',
    title: 'Rebuild Brikama Market Stalls After Fire',
    creatorName: 'Brikama Market Committee',
    creatorAvatar:
      'https://images.unsplash.com/photo-1531123897727-8f129e1bfa82?w=150&h=150&fit=crop&q=80',
    category: 'Emergency',
    shortDescription:
      'Help 20 female vendors rebuild their stalls and restock their goods after the devastating fire at Brikama Market.',
    fullDescription:
      'On Tuesday night, a devastating fire swept through a section of the Brikama Market, destroying the stalls and livelihoods of 20 female vendors. These women are the primary breadwinners for their families, selling vegetables, fabrics, and household goods.\n\nWe are raising funds to:\n1. Rebuild the wooden and corrugated metal stalls (D150,000)\n2. Provide emergency capital for each woman to restock (D10,000 each)\n\nEvery Dalasi counts. Please help these mothers and sisters get back on their feet.',
    goalAmount: 350000,
    raisedAmount: 215000,
    donorCount: 142,
    daysLeft: 14,
    coverImage:
      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80',
    isTrending: true,
    recentDonors: [
      {
        donorName: 'Fatoumatta Jallow',
        amount: 500,
        currency: 'GMD',
        message: 'May Allah bless this initiative.',
        isAnonymous: false,
        createdAt: '2026-04-16T18:00:00.000Z'
      },
      {
        donorName: 'Anonymous',
        amount: 1000,
        currency: 'GMD',
        isAnonymous: true,
        createdAt: '2026-04-16T15:00:00.000Z'
      },
      {
        donorName: 'Lamin Sanneh',
        amount: 250,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-15T20:00:00.000Z'
      },
      {
        donorName: 'Sarah Jenkins',
        amount: 50,
        currency: 'USD',
        message: 'Sending love from the UK!',
        isAnonymous: false,
        createdAt: '2026-04-15T12:00:00.000Z'
      }
    ]
  },
  {
    slug: 'solar-panels-for-soma-primary',
    title: 'Solar Panels for Soma Primary School',
    creatorName: 'Ousman Darboe',
    creatorAvatar:
      'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?w=150&h=150&fit=crop&q=80',
    category: 'Education',
    shortDescription:
      'Providing reliable electricity for 400 students to study and use computers.',
    fullDescription:
      "Soma Primary School serves over 400 students but suffers from frequent power outages, making it impossible to run the new computer lab donated last year. We want to install a 5kW solar panel system with battery storage to ensure uninterrupted learning.\n\nEducation is the key to our nation's future. Your support will directly impact these children's ability to learn digital skills.",
    goalAmount: 200000,
    raisedAmount: 185000,
    donorCount: 89,
    daysLeft: 5,
    coverImage:
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80',
    isTrending: true,
    recentDonors: [
      {
        donorName: 'Anonymous',
        amount: 1000,
        currency: 'GMD',
        isAnonymous: true,
        createdAt: '2026-04-16T15:00:00.000Z'
      },
      {
        donorName: 'Lamin Sanneh',
        amount: 250,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-15T20:00:00.000Z'
      },
      {
        donorName: 'Sarah Jenkins',
        amount: 50,
        currency: 'USD',
        message: 'Sending love from the UK!',
        isAnonymous: false,
        createdAt: '2026-04-15T12:00:00.000Z'
      },
      {
        donorName: 'Modou Ceesay',
        amount: 2000,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-14T21:00:00.000Z'
      }
    ]
  },
  {
    slug: 'medical-fund-baby-aisha',
    title: 'Urgent Heart Surgery for Baby Aisha',
    creatorName: 'Mariama Bah',
    creatorAvatar:
      'https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=150&h=150&fit=crop&q=80',
    category: 'Medical',
    shortDescription:
      'Aisha needs urgent pediatric heart surgery in Dakar. Help us save her life.',
    fullDescription:
      'Our beautiful 8-month-old daughter, Aisha, was born with a congenital heart defect. The doctors at EFSTH have advised that she needs specialized surgery that is only available in Dakar, Senegal.\n\nThe cost of the surgery, travel, and accommodation is beyond our means. We are humbly asking for your assistance to give our baby girl a chance at a healthy life.',
    goalAmount: 450000,
    raisedAmount: 120000,
    donorCount: 205,
    daysLeft: 21,
    coverImage:
      'https://images.unsplash.com/photo-1584515933487-779824d29309?w=800&q=80',
    isTrending: true,
    recentDonors: [
      {
        donorName: 'Fatoumatta Jallow',
        amount: 500,
        currency: 'GMD',
        message: 'May Allah bless this initiative.',
        isAnonymous: false,
        createdAt: '2026-04-16T18:00:00.000Z'
      },
      {
        donorName: 'Anonymous',
        amount: 1000,
        currency: 'GMD',
        isAnonymous: true,
        createdAt: '2026-04-16T15:00:00.000Z'
      },
      {
        donorName: 'Lamin Sanneh',
        amount: 250,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-15T20:00:00.000Z'
      },
      {
        donorName: 'Sarah Jenkins',
        amount: 50,
        currency: 'USD',
        message: 'Sending love from the UK!',
        isAnonymous: false,
        createdAt: '2026-04-15T12:00:00.000Z'
      },
      {
        donorName: 'Modou Ceesay',
        amount: 2000,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-14T21:00:00.000Z'
      }
    ]
  },
  {
    slug: 'empower-youth-tech-hub',
    title: 'Banjul Youth Tech Hub Equipment',
    creatorName: 'TechGambia NGO',
    creatorAvatar:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&q=80',
    category: 'Community',
    shortDescription:
      'Equipping a new tech hub in Banjul to train 100 youths annually in coding and design.',
    fullDescription:
      'Youth unemployment is a major challenge. We are setting up a free tech training hub in Banjul to teach software development, graphic design, and digital marketing.\n\nWe have secured the space, but we need funds to purchase 20 laptops, desks, and a reliable internet setup. Help us empower the next generation of Gambian tech leaders.',
    goalAmount: 500000,
    raisedAmount: 50000,
    donorCount: 12,
    daysLeft: 45,
    coverImage:
      'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&q=80',
    recentDonors: [
      {
        donorName: 'Lamin Sanneh',
        amount: 250,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-15T20:00:00.000Z'
      },
      {
        donorName: 'Sarah Jenkins',
        amount: 50,
        currency: 'USD',
        message: 'Sending love from the UK!',
        isAnonymous: false,
        createdAt: '2026-04-15T12:00:00.000Z'
      }
    ]
  },
  {
    slug: 'poultry-farm-expansion',
    title: "Fatou's Poultry Farm Expansion",
    creatorName: 'Fatou Touray',
    creatorAvatar:
      'https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=150&h=150&fit=crop&q=80',
    category: 'Business',
    shortDescription:
      'Expanding a local poultry farm to supply fresh eggs to the community and create 3 jobs.',
    fullDescription:
      'I started my poultry farm with 50 birds two years ago. Today, the demand for fresh, locally produced eggs in my community far exceeds what I can supply.\n\nI am raising funds to build a larger coop, purchase 500 day-old chicks, and buy feed for the first 3 months. This expansion will allow me to hire 3 young people from my village.',
    goalAmount: 150000,
    raisedAmount: 145000,
    donorCount: 64,
    daysLeft: 2,
    coverImage:
      'https://images.unsplash.com/photo-1595801974780-877717646194?w=800&q=80',
    recentDonors: [
      {
        donorName: 'Fatoumatta Jallow',
        amount: 500,
        currency: 'GMD',
        message: 'May Allah bless this initiative.',
        isAnonymous: false,
        createdAt: '2026-04-16T18:00:00.000Z'
      },
      {
        donorName: 'Anonymous',
        amount: 1000,
        currency: 'GMD',
        isAnonymous: true,
        createdAt: '2026-04-16T15:00:00.000Z'
      },
      {
        donorName: 'Lamin Sanneh',
        amount: 250,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-15T20:00:00.000Z'
      }
    ]
  },
  {
    slug: 'clean-water-for-farafenni',
    title: 'Clean Water Borehole for Farafenni Outskirts',
    creatorName: 'Clean Water Initiative',
    creatorAvatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&q=80',
    category: 'Community',
    shortDescription:
      'Drilling a solar-powered borehole to provide clean drinking water to 50+ compounds.',
    fullDescription:
      'Women and children in the outskirts of Farafenni currently walk over 3 kilometers daily to fetch clean water. We want to change this by drilling a solar-powered borehole with a 5000-liter overhead tank right in the heart of the community.\n\nAccess to clean water is a basic human right. Join us in making this a reality.',
    goalAmount: 250000,
    raisedAmount: 75000,
    donorCount: 38,
    daysLeft: 30,
    coverImage:
      'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80',
    recentDonors: [
      {
        donorName: 'Anonymous',
        amount: 1000,
        currency: 'GMD',
        isAnonymous: true,
        createdAt: '2026-04-16T15:00:00.000Z'
      },
      {
        donorName: 'Lamin Sanneh',
        amount: 250,
        currency: 'GMD',
        isAnonymous: false,
        createdAt: '2026-04-15T20:00:00.000Z'
      },
      {
        donorName: 'Sarah Jenkins',
        amount: 50,
        currency: 'USD',
        message: 'Sending love from the UK!',
        isAnonymous: false,
        createdAt: '2026-04-15T12:00:00.000Z'
      }
    ]
  }
];
