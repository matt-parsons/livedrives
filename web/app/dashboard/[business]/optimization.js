function parseDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }

    const milliseconds = value > 1e12 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    // Handle relative dates like "3 days ago", "6 days ago", "2 weeks ago", "1 month ago"
    const relativeMatch = trimmed.match(/^(\d+)\s+(day|week|month)s?\s+ago$/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const date = new Date();
      
      if (unit === 'day') {
        date.setDate(date.getDate() - amount);
      } else if (unit === 'week') {
        date.setDate(date.getDate() - (amount * 7));
      } else if (unit === 'month') {
        date.setMonth(date.getMonth() - amount);
      }
      
      return date;
    }

    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      return parseDateInput(numeric);
    }

    const parsed = Date.parse(trimmed);

    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
}

function describeRecency(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return { formatted: null, relative: null, daysAgo: null };
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const daysAgo = diffMs < 0 ? 0 : Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative;

  if (daysAgo === 0) {
    relative = 'today';
  } else if (daysAgo === 1) {
    relative = 'yesterday';
  } else if (daysAgo < 7) {
    relative = `${daysAgo} days ago`;
  } else if (daysAgo < 60) {
    const weeks = Math.floor(daysAgo / 7);
    relative = `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  } else if (daysAgo < 365) {
    const months = Math.floor(daysAgo / 30);
    relative = `${months} month${months === 1 ? '' : 's'} ago`;
  } else {
    const years = Math.floor(daysAgo / 365);
    relative = `${years} year${years === 1 ? '' : 's'} ago`;
  }

  const formatted = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return { formatted, relative, daysAgo };
}

function normalizeStatus(key) {
  const mapping = {
    completed: { key: 'completed', label: 'Completed' },
    in_progress: { key: 'in_progress', label: 'Needs Improvement' },
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

  if (normalized === 'OPERATIONAL' || normalized === 'OPEN' || normalized === 'TRUE') {
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
      detail: `Description length looks healthy (160+ characters).`
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
    detail: 'Your profile does not have a description.'
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
  // console.log('photostatus', photoCount, sidebarPhotos);
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
  const categories = Array.isArray(place.categories)
    ? place.categories.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  const serviceCapabilities = Array.isArray(place.serviceCapabilities)
    ? place.serviceCapabilities.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  const weekdayText = Array.isArray(place.weekdayText)
    ? place.weekdayText.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  const timezone =
    typeof place.timezone === 'string' && place.timezone.trim().length ? place.timezone.trim() : null;
  const businessStatus =
    typeof place.businessStatus === 'string' && place.businessStatus.trim().length
      ? place.businessStatus
          .toString()
          .split('_')
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
          .join(' ')
      : null;

  const reviewSource = place.latestReview ?? null;
  let latestReview = null;

  if (reviewSource) {
    const reviewDate = parseDateInput(
      reviewSource.time ?? reviewSource.timestamp ?? reviewSource.date ?? reviewSource.time_ms
    );
    const { formatted, relative } = describeRecency(reviewDate);
    const ratingValue = Number(reviewSource.rating);

    latestReview = {
      authorName: reviewSource.author_name ?? null,
      authorUrl: reviewSource.author_url ?? null,
      profilePhotoUrl: reviewSource.profile_photo_url ?? null,
      rating: Number.isFinite(ratingValue) ? ratingValue : null,
      text: reviewSource.text ?? null,
      relativeTimeDescription:
        reviewSource.relative_time_description ?? reviewSource.relativeTimeDescription ?? relative ?? null,
      postedAt: formatted ?? null,
      postedAtIso: reviewDate ? reviewDate.toISOString() : null,
      language: reviewSource.language ?? null,
      originalLanguage: reviewSource.original_language ?? null,
      translated: Boolean(reviewSource.translated)
    };
  }

  const latestPostDate = parseDateInput(place.latestPostDate);
  const latestPost = latestPostDate
    ? {
        iso: latestPostDate.toISOString(),
        formatted: latestPostDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        relative: describeRecency(latestPostDate).relative
      }
    : null;

  const reviewSnippets = Array.isArray(place.sidebar?.reviews)
    ? place.sidebar.reviews
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    : [];
  const postLinks = Array.isArray(place.sidebar?.posts)
    ? place.sidebar.posts
        .map((value) => {
          if (value && typeof value === 'object') {
            const link = value.link || value.url || value.cta_link;
            return typeof link === 'string' ? link.trim() : '';
          }

          return '';
        })
        .filter((value) => value.length > 0)
    : [];

  return {
    placeId: typeof place.placeId === 'string' && place.placeId.trim().length ? place.placeId.trim() : null,
    cid: typeof place.cid === 'string' && place.cid.trim().length ? place.cid.trim() : null,
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
        : null,
    categories,
    serviceCapabilities,
    weekdayText,
    timezone,
    businessStatus,
    latestReview,
    latestPost,
    reviewSnippets,
    posts: postLinks
  };
}

function computeCategoryStatus(categories) {
  const list = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const text = list.join(', ');

  if (list.length >= 2) {
    return {
      status: normalizeStatus('completed'),
      detail: `${list.length} categories detected`
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


function computeHoursStatus(weekdayEntries) {
  // console.log('weekdayText', weekdayText);


  if (weekdayEntries >= 5) {
    return {
      status: normalizeStatus('completed'),
      detail: `Weekly hours detected in Google`
    };
  }

  if (weekdayEntries > 0) {
    return {
      status: normalizeStatus('in_progress'),
      detail: 'Partial hours detected. Ensure all days are configured.'
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No hours detected on your profile.'
  };
}

function computeLastUpdate(latestPostDate) {
  const postDate = parseDateInput(latestPostDate);

  if (!postDate) {
    return {
      status: normalizeStatus('pending'),
      detail: 'No Google posts detected yet. Share updates weekly to stay fresh.'
    };
  }

  const { formatted, relative, daysAgo } = describeRecency(postDate);
  const label = formatted ? `${formatted}${relative ? ` (${relative})` : ''}` : relative ?? 'recently';

  let statusKey = 'in_progress';

  if (typeof daysAgo === 'number') {
    if (daysAgo <= 14) {
      statusKey = 'completed';
    } else if (daysAgo <= 45) {
      statusKey = 'in_progress';
    } else {
      statusKey = 'pending';
    }
  }

  return {
    status: normalizeStatus(statusKey),
    detail: `Last Google post detected on ${label}.`
  };
}

function computePhoneStatus(phoneNumber) {
  if (phoneNumber) {
    return {
      status: normalizeStatus('completed'),
      detail: `Business phone number detected`
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
      detail: `Website link detected`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No website detected. Add one to drive conversions.'
  };
}

function computeReviewStatus(reviewCount, latestReview) {
  // console.log('computeReviewStatus', reviewCount);
  const count = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 0;

  if (!reviewCount) {
    return {
      status: normalizeStatus('pending'),
      freshness: 'dormant',
      detail: 'No reviews detected yet. Encourage customers to share feedback.'
    };
  }
  let freshness = 'dormant';
  let label = '';

  if(latestReview) {
    const reviewDate = parseDateInput(
      latestReview.time ?? latestReview.timestamp ?? latestReview.date ?? latestReview.time_ms
    );
    const { formatted, relative, daysAgo } = describeRecency(reviewDate);
    const relativeDescription =
      latestReview.relative_time_description ?? latestReview.relativeTimeDescription ?? relative ?? 'recently';
    label = formatted ? `${formatted}${relativeDescription ? ` (${relativeDescription})` : ''}` : relativeDescription;



    if (typeof daysAgo === 'number') {
      if (daysAgo <= 30) {
        freshness = 'active';
      } else if (daysAgo <= 90) {
        freshness = 'stale';
      }
    }
  } else {
    freshness = 'stale';
    label = 'unknown';
  }

  if (count >= 25) {
    return {
      status: normalizeStatus('completed'),
      freshness,
      detail: `${count} reviews detected. Great momentum! Last review on ${label}.`
    };
  }

  if (count > 0) {
    return {
      status: normalizeStatus('in_progress'),
      freshness,
      detail: `${count} review${count === 1 ? '' : 's'} detected. Last review on ${label}. Aim for 25+ recent reviews.`
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
  if (value >= 90) return 'A';
  if (value >= 83) return 'A-';
  if (value >= 76) return 'B+';
  if (value >= 69) return 'B';
  if (value >= 62) return 'B-';
  if (value >= 55) return 'C+';
  if (value >= 48) return 'C';
  if (value >= 41) return 'C-';
  if (value >= 34) return 'D+';
  if (value >= 27) return 'D';
  if (value >= 20) return 'D-';
  return 'F';
}

function clampPercent(value) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }

  return Math.max(0, Math.min(100, Number(value)));
}

export function resolveProfileHealthSummary(progressPercent) {
  const percent = clampPercent(progressPercent);

  if (percent === null) {
    return {
      statusLabel: 'Checking',
      headline: 'We are still evaluating your profile health.',
      reinforcement: 'Stay active while we gather the latest signals.',
      showProgressBar: false,
      progressFill: 0,
      nextFocus: 'Monitor rankings and defend visibility across nearby neighborhoods'
    };
  }

  const tiers = [
    {
      min: 85,
      statusLabel: 'Strong',
      headline: 'Your Google Business Profile foundation is in good shape.',
      reinforcement: 'Ongoing rankings depend on staying active and competitive.',
      showProgressBar: false
    },
    {
      min: 65,
      statusLabel: 'Healthy',
      headline: 'Your profile fundamentals look healthy.',
      reinforcement: 'Keep publishing updates and earning reviews to defend visibility.',
      showProgressBar: true
    },
    {
      min: 45,
      statusLabel: 'Competitive',
      headline: 'Core details are set. There is still room to strengthen visibility.',
      reinforcement: 'Add recent photos, posts, and keywords to build momentum.',
      showProgressBar: true
    },
    {
      min: 0,
      statusLabel: 'Building',
      headline: 'Key profile basics still need attention.',
      reinforcement: 'Finish the essentials to improve health and readiness.',
      showProgressBar: true
    }
  ];

  const tier = tiers.find((entry) => percent >= entry.min) ?? tiers[tiers.length - 1];

  return {
    ...tier,
    progressFill: percent,
    nextFocus: 'Monitor rankings and defend visibility across nearby neighborhoods'
  };
}

export function resolveSectionHealthLabel(sectionId, completion) {
  const percent = clampPercent(completion);

  const tierKey = percent === null
    ? 'unknown'
    : percent >= 85
      ? 'strong'
      : percent >= 65
        ? 'healthy'
        : percent >= 45
          ? 'building'
          : 'at_risk';

  const defaults = {
    strong: 'Strong',
    healthy: 'Healthy',
    building: 'Building',
    at_risk: 'Needs attention',
    unknown: 'Needs review'
  };

  const sectionLabels = {
    'profile-completeness': {
      strong: 'Complete',
      healthy: 'Nearly complete',
      building: 'Stabilizing',
      at_risk: 'Needs setup'
    },
    'visual-presence': {
      strong: 'Up to date',
      healthy: 'Fresh',
      building: 'Add new photos',
      at_risk: 'Missing photos'
    },
    'customer-engagement': {
      strong: 'Active',
      healthy: 'Responsive',
      building: 'Rebuilding trust',
      at_risk: 'Needs engagement'
    },
    'local-seo-optimization': {
      strong: 'Strong',
      healthy: 'Competitive',
      building: 'Building coverage',
      at_risk: 'Needs focus'
    }
  };

  return sectionLabels[sectionId]?.[tierKey] ?? defaults[tierKey] ?? defaults.unknown;
}

function buildManualCompletionMap(records) {
  if (!Array.isArray(records) || !records.length) {
    return new Map();
  }

  const entries = records
    .filter((record) => record && record.taskId && !record.resolvedAt)
    .map((record) => [record.taskId, record]);

  return new Map(entries);
}

function attachManualCompletion(task, manualCompletions) {
  if (!task || !manualCompletions?.size) {
    return task;
  }

  const manualCompletion = manualCompletions.get(task.id);

  if (!manualCompletion || task.status?.key === 'completed') {
    return task;
  }

  return {
    ...task,
    manualCompletion
  };
}

const SECTION_DEFINITIONS = [
  {
    id: 'profile-completeness',
    title: 'Business Setup',
    description: 'Make sure customers see the most accurate business basics.',
    taskIds: ['claim-profile', 'hours', 'phone-number', 'website']
  },
  {
    id: 'visual-presence',
    title: 'Photos',
    description: 'Keep the listing visually fresh with current media.',
    taskIds: ['photos']
  },
  {
    id: 'customer-engagement',
    title: 'Customer Trust',
    description: 'Respond to customers and share updates to build trust.',
    taskIds: ['reviews', 'update-posts']
  },
  {
    id: 'local-seo-optimization',
    title: 'Local Visibility',
    description: 'Improve keyword coverage for local search.',
    taskIds: ['description', 'categories']
  },
];

export function buildOptimizationRoadmap(place, options = {}) {
  if (!place) {
    return null;
  }
  // console.log('buildOptimizationRoadmap', place);

  const sidebarPhotos = normalizeSidebarPhotos(place.sidebar);
  const manualCompletionMap = buildManualCompletionMap(options.manualCompletions);

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
      ...computeHoursStatus(place.openingHours)
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
    }
  ].map((task) => attachManualCompletion(task, manualCompletionMap));

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

export function selectNextOptimizationSteps(roadmap, limit = 3) {
  if (!roadmap || !Array.isArray(roadmap.tasks)) {
    return [];
  }

  return roadmap.tasks
    .filter((task) => task.status && task.status.key !== 'completed')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, limit);
}
