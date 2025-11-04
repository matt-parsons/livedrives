function normalizeStatus(key) {
  const mapping = {
    completed: { key: 'completed', label: 'Completed' },
    in_progress: { key: 'in_progress', label: 'In progress' },
    pending: { key: 'pending', label: 'Needs attention' },
    unknown: { key: 'unknown', label: 'Manual check' }
  };

  return mapping[key] ?? mapping.pending;
}

function computeClaimStatus(businessStatus) {
  if (!businessStatus) {
    return {
      status: normalizeStatus('pending'),
      detail: 'No business status was returned from Google. Claiming or verification may still be pending.'
    };
  }

  const normalized = businessStatus.toString().toUpperCase();

  if (normalized === 'OPERATIONAL' || normalized === 'OPEN') {
    return {
      status: normalizeStatus('completed'),
      detail: 'Google lists this place as operational.'
    };
  }

  if (normalized === 'CLOSED_TEMPORARILY') {
    return {
      status: normalizeStatus('in_progress'),
      detail: 'The profile is marked as temporarily closed. Reopen in Google to unlock full visibility.'
    };
  }

  if (normalized === 'CLOSED_PERMANENTLY') {
    return {
      status: normalizeStatus('pending'),
      detail: 'Google reports this location as permanently closed.'
    };
  }

  return {
    status: normalizeStatus('in_progress'),
    detail: `Current status: ${businessStatus}.`
  };
}

function computeDescriptionStatus(description) {
  const length = typeof description === 'string' ? description.trim().length : 0;

  if (length >= 160) {
    return {
      status: normalizeStatus('completed'),
      detail: `Description length looks healthy (160+ characters).<br> ${description}`
    };
  }

  if (length > 0) {
    return {
      status: normalizeStatus('in_progress'),
      detail: 'Description is present but could benefit from more detail (aim for 160+ characters).'
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No description returned via Google Places.'
  };
}

function normalizeSidebarPhotos(sidebar) {
  if (!sidebar || typeof sidebar !== 'object') {
    return [];
  }

  const photos = Array.isArray(sidebar.photos) ? sidebar.photos : [];

  return Array.from(
    new Set(
      photos
        .map((url) => (typeof url === 'string' ? url.trim() : ''))
        .filter((url) => url.length > 0)
    )
  );
}

function computePhotoStatus(photoCount, sidebarPhotos) {
  const apiCount = Number.isFinite(Number(photoCount)) ? Number(photoCount) : 0;
  const sidebarCount = Array.isArray(sidebarPhotos) ? sidebarPhotos.length : 0;
  const count = Math.max(apiCount, sidebarCount);

  if (count >= 10) {
    return {
      status: normalizeStatus('completed'),
      detail: `At least ${count} photos detected. Make sure you're adding new photos every month.`
    };
  }

  if (count > 0 && count <= 9) {
    return {
      status: normalizeStatus('in_progress'),
      detail: `${count} photo${count === 1 ? '' : 's'} detected. Add at least 10 high-quality photos.`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No photos detected from Google. Add high-quality images to make a strong first impression.'
  };
}

function buildProfilePreview(place, sidebarPhotosArg) {
  if (!place) {
    return null;
  }

  const sidebarPhotos = Array.isArray(sidebarPhotosArg)
    ? sidebarPhotosArg
    : normalizeSidebarPhotos(place.sidebar);
  const coverPhoto =
    (place.sidebar && typeof place.sidebar.coverPhoto === 'string' && place.sidebar.coverPhoto.trim().length
      ? place.sidebar.coverPhoto.trim()
      : null) || sidebarPhotos[0] || null;

  const rating = Number.isFinite(Number(place.rating)) ? Number(place.rating) : null;
  const reviewCount = Number.isFinite(Number(place.reviewCount)) ? Number(place.reviewCount) : null;

  return {
    name: place.name ?? null,
    rating,
    reviewCount,
    description: typeof place.description === 'string' && place.description.trim().length
      ? place.description.trim()
      : null,
    address:
      typeof place.formattedAddress === 'string' && place.formattedAddress.trim().length
        ? place.formattedAddress.trim()
        : null,
    phoneNumber:
      typeof place.phoneNumber === 'string' && place.phoneNumber.trim().length
        ? place.phoneNumber.trim()
        : null,
    website:
      typeof place.website === 'string' && place.website.trim().length ? place.website.trim() : null,
    googleMapsUri:
      typeof place.googleMapsUri === 'string' && place.googleMapsUri.trim().length
        ? place.googleMapsUri.trim()
        : null,
    photos: sidebarPhotos,
    coverPhoto,
    primaryCategory:
      typeof place.primaryCategory === 'string' && place.primaryCategory.trim().length
        ? place.primaryCategory.trim()
        : null
  };
}

function computeCategoryStatus(categories) {
  const list = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const text = list.join(', ');

  if (list.length >= 2) {
    return {
      status: normalizeStatus('completed'),
      detail: `${list.length} categories detected: ${text}`
    };
  }

  if (list.length === 1) {
    return {
      status: normalizeStatus('in_progress'),
      detail: `Only one category detected. ${text}. Add secondary categories to improve visibility.`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No categories returned from Google Places.'
  };
}

function computeServicesStatus(serviceCapabilities) {
  const list = Array.isArray(serviceCapabilities) ? serviceCapabilities : [];

  if (list.length >= 2) {
    return {
      status: normalizeStatus('completed'),
      detail: `${list.length} service capabilities detected.`
    };
  }

  if (list.length === 1) {
    return {
      status: normalizeStatus('in_progress'),
      detail: `${list[0]} detected. Add more services to round out your offering.`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No service capabilities returned via the Places API.'
  };
}

function computeHoursStatus(weekdayText) {
  const entries = Array.isArray(weekdayText) ? weekdayText.filter(Boolean) : [];
  const hoursText = entries.join(' ');


  if (entries.length >= 5) {
    return {
      status: normalizeStatus('completed'),
      detail: `Weekly hours detected in Google: ${hoursText}`
    };
  }

  if (entries.length > 0) {
    return {
      status: normalizeStatus('in_progress'),
      detail: 'Partial hours detected. Ensure all days are configured.'
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No hours detected from the Places API.'
  };
}

function computeLastUpdate(latestPostDate) {
  console.log('computeLastUpdate', latestPostDate);
  const lastUpdate = latestPostDate;

  if (lastUpdate) {
    return {
      status: normalizeStatus('completed'),
      detail: 'Your last update was: ', lastUpdate
    };
  }

  if (lastUpdate === '') {
    return {
      status: normalizeStatus('in_progress'),
      detail: 'You should post an update at least once a week:', lastUpdate
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'You should post an update at least once a week:', lastUpdate
  };
}

function computePhoneStatus(phoneNumber) {
  if (phoneNumber) {
    return {
      status: normalizeStatus('completed'),
      detail: `Business phone number detected: ${phoneNumber}`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No phone number returned from Google Places.'
  };
}

function computeWebsiteStatus(website) {
  if (website) {
    return {
      status: normalizeStatus('completed'),
      detail: `Website link detected: ${website}`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No website detected. Add one to drive conversions.'
  };
}

function computeReviewStatus(reviewCount, latestReview) {
  const count = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 0;
  if (!latestReview) {
    return {
      status: normalizeStatus('pending'),
      freshness: 'dormant',
      detail: 'No reviews detected yet. Encourage customers to share feedback.'
    };
  }

  const reviewDate = new Date(latestReview.time * 1000);
  const formattedDate = reviewDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // calculate days since last review
  const daysAgo = Math.floor((Date.now() - reviewDate.getTime()) / (1000 * 60 * 60 * 24));

  // relative text for humans
  let relative;
  if (daysAgo < 1) relative = "today";
  else if (daysAgo === 1) relative = "yesterday";
  else if (daysAgo < 7) relative = `${daysAgo} days ago`;
  else if (daysAgo < 60) {
    const weeks = Math.floor(daysAgo / 7);
    relative = `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  } else if (daysAgo < 365) {
    const months = Math.floor(daysAgo / 30);
    relative = `${months} month${months === 1 ? '' : 's'} ago`;
  } else {
    const years = Math.floor(daysAgo / 365);
    relative = `${years} year${years === 1 ? '' : 's'} ago`;
  }

  // freshness classification
  let freshness;
  if (daysAgo <= 30) freshness = 'active';
  else if (daysAgo <= 90) freshness = 'stale';
  else freshness = 'dormant';

  // decide status block
  if (count >= 25) {
    return {
      status: normalizeStatus('completed'),
      freshness,
      detail: `${count} reviews detected. Great momentum! Last review on ${formattedDate} (${relative}).`
    };
  }

  if (count > 0) {
    return {
      status: normalizeStatus('in_progress'),
      freshness,
      detail: `${count} review${count === 1 ? '' : 's'} detected. Last review on ${formattedDate} (${relative}). Aim for 25+ recent reviews.`
    };
  }

  return {
    status: normalizeStatus('pending'),
    freshness: 'dormant',
    detail: 'No reviews detected yet. Encourage customers to share feedback.'
  };
}


const STATUS_SCORES = {
  completed: 1,
  in_progress: 0.5,
  pending: 0,
  unknown: null
};

export function resolveLetterGrade(percent) {
  if (percent === null || percent === undefined) {
    return '—';
  }

  const value = Number(percent);

  if (!Number.isFinite(value)) {
    return '—';
  }

  if (value >= 97) return 'A+';
  if (value >= 93) return 'A';
  if (value >= 90) return 'A-';
  if (value >= 87) return 'B+';
  if (value >= 83) return 'B';
  if (value >= 80) return 'B-';
  if (value >= 77) return 'C+';
  if (value >= 73) return 'C';
  if (value >= 70) return 'C-';
  if (value >= 67) return 'D+';
  if (value >= 63) return 'D';
  if (value >= 60) return 'D-';
  return 'F';
}

const SECTION_DEFINITIONS = [
  {
    id: 'profile-completeness',
    title: 'Profile Completeness',
    description: 'Make sure customers see the most accurate business basics.',
    taskIds: ['claim-profile', 'hours', 'phone-number', 'website']
  },
  {
    id: 'visual-presence',
    title: 'Visual Presence',
    description: 'Keep the listing visually fresh with current media.',
    taskIds: ['photos']
  },
  {
    id: 'customer-engagement',
    title: 'Customer Engagement',
    description: 'Respond to customers and share updates to build trust.',
    taskIds: ['reviews', 'update-posts']
  },
  {
    id: 'local-seo-optimization',
    title: 'Local SEO Optimization',
    description: 'Improve keyword coverage and service clarity for local search.',
    taskIds: ['description', 'categories', 'services', 'service-descriptions']
  },
  {
    id: 'competitive-analysis',
    title: 'Competitive Analysis',
    description: 'Track how nearby competitors attract attention.',
    taskIds: ['competitive-benchmark', 'competitive-keywords']
  }
];

export function buildOptimizationRoadmap(place) {
  if (!place) {
    return null;
  }

  const sidebarPhotos = normalizeSidebarPhotos(place.sidebar);

  const tasks = [
    {
      id: 'claim-profile',
      label: 'Claim your Business Profile',
      weight: 20,
      auto: true,
      ...computeClaimStatus(place.businessStatus)
    },
    {
      id: 'description',
      label: 'Publish a compelling description',
      weight: 15,
      auto: true,
      ...computeDescriptionStatus(place.description)
    },
    {
      id: 'photos',
      label: 'Upload high-quality photos',
      weight: 15,
      auto: true,
      ...computePhotoStatus(place.photoCount, sidebarPhotos)
    },
    {
      id: 'categories',
      label: 'Select relevant categories',
      weight: 10,
      auto: true,
      ...computeCategoryStatus(place.categories)
    },
    {
      id: 'services',
      label: 'Publish services',
      weight: 10,
      auto: true,
      ...computeServicesStatus(place.serviceCapabilities)
    },
    {
      id: 'service-descriptions',
      label: 'Add service descriptions',
      weight: 8,
      auto: false,
      status: normalizeStatus('pending'),
      detail: 'Google Places does not expose service descriptions. Confirm each service has on-brand copy inside GBP.'
    },
    {
      id: 'update-posts',
      label: 'Post weekly updates',
      weight: 7,
      auto: true,
      ...computeLastUpdate(place.latestPostDate)
    },
    {
      id: 'hours',
      label: 'Publish accurate business hours',
      weight: 6,
      auto: true,
      ...computeHoursStatus(place.weekdayText)
    },
    {
      id: 'phone-number',
      label: 'Add a primary phone number',
      weight: 4,
      auto: true,
      ...computePhoneStatus(place.phoneNumber)
    },
    {
      id: 'website',
      label: 'Link to your website',
      weight: 3,
      auto: true,
      ...computeWebsiteStatus(place.website)
    },
    {
      id: 'reviews',
      label: 'Build review velocity',
      weight: 2,
      auto: true,
      ...computeReviewStatus(place.reviewCount, place.latestReview)
    },
    {
      id: 'competitive-benchmark',
      label: 'Monitor top local competitors',
      weight: 5,
      auto: false,
      status: normalizeStatus('pending'),
      detail:
        'Identify the top three profiles ranking for your priority keywords and track how often they earn new reviews or posts.'
    },
    {
      id: 'competitive-keywords',
      label: 'Compare keyword positioning',
      weight: 4,
      auto: false,
      status: normalizeStatus('pending'),
      detail: 'Use geo grid runs to spot keywords where competitors outrank you and plan follow-up actions.'
    }
  ];

  const automatedTasks = tasks.filter((task) => task.auto);
  const manualTasks = tasks.filter((task) => !task.auto);
  const automatedWeight = automatedTasks.reduce((sum, task) => sum + task.weight, 0);
  const manualWeight = manualTasks.reduce((sum, task) => sum + task.weight, 0);
  const completedWeight = automatedTasks.reduce((sum, task) => {
    const score = STATUS_SCORES[task.status.key] ?? 0;
    return sum + score * task.weight;
  }, 0);
  const progressPercent =
    automatedWeight > 0 ? Math.round((completedWeight / automatedWeight) * 100) : 0;

  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  const sections = SECTION_DEFINITIONS.map((section) => {
    const sectionTasks = section.taskIds
      .map((taskId) => taskMap.get(taskId))
      .filter(Boolean)
      .map((task) => ({ ...task }));

    const weightedScores = sectionTasks.reduce(
      (acc, task) => {
        const weight = Number.isFinite(Number(task.weight)) ? Number(task.weight) : 0;
        const score = STATUS_SCORES[task.status.key];

        if (typeof score !== 'number') {
          return {
            completed: acc.completed,
            available: acc.available,
            total: acc.total + weight
          };
        }

        return {
          completed: acc.completed + score * weight,
          available: acc.available + weight,
          total: acc.total + weight
        };
      },
      { completed: 0, available: 0, total: 0 }
    );

    const completion = weightedScores.available > 0 ? Math.round((weightedScores.completed / weightedScores.available) * 100) : null;

    return {
      id: section.id,
      title: section.title,
      description: section.description,
      grade: resolveLetterGrade(completion),
      completion,
      weight: weightedScores.total,
      tasks: sectionTasks
    };
  });

  return {
    place,
    profilePreview: buildProfilePreview(place, sidebarPhotos),
    tasks,
    sections,
    automatedWeight,
    manualWeight,
    completedWeight,
    progressPercent
  };
}
