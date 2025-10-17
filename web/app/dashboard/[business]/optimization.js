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
      detail: 'Description length looks healthy (160+ characters).'
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

function computePhotoStatus(photoCount) {
  const count = Number.isFinite(Number(photoCount)) ? Number(photoCount) : 0;

  if (count >= 5) {
    return {
      status: normalizeStatus('completed'),
      detail: `${count} photos detected.`
    };
  }

  if (count > 0) {
    return {
      status: normalizeStatus('in_progress'),
      detail: `${count} photo${count === 1 ? '' : 's'} detected. Add at least 5 high-quality photos.`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No photos detected from the Places API.'
  };
}

function computeCategoryStatus(categories) {
  const list = Array.isArray(categories) ? categories.filter(Boolean) : [];

  if (list.length >= 2) {
    return {
      status: normalizeStatus('completed'),
      detail: `${list.length} categories detected.`
    };
  }

  if (list.length === 1) {
    return {
      status: normalizeStatus('in_progress'),
      detail: 'Only one category detected. Add secondary categories to improve visibility.'
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

  if (entries.length >= 5) {
    return {
      status: normalizeStatus('completed'),
      detail: 'Weekly hours detected in Google.'
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

function computePhoneStatus(phoneNumber) {
  if (phoneNumber) {
    return {
      status: normalizeStatus('completed'),
      detail: 'Business phone number detected.'
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
      detail: 'Website link detected.'
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No website detected. Add one to drive conversions.'
  };
}

function computeReviewStatus(reviewCount) {
  const count = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 0;

  if (count >= 25) {
    return {
      status: normalizeStatus('completed'),
      detail: `${count} reviews detected. Great momentum!`
    };
  }

  if (count > 0) {
    return {
      status: normalizeStatus('in_progress'),
      detail: `${count} review${count === 1 ? '' : 's'} detected. Aim for 25+ recent reviews.`
    };
  }

  return {
    status: normalizeStatus('pending'),
    detail: 'No reviews detected yet. Encourage customers to share feedback.'
  };
}

const STATUS_SCORES = {
  completed: 1,
  in_progress: 0.5,
  pending: 0,
  unknown: 0
};

export function buildOptimizationRoadmap(place) {
  if (!place) {
    return null;
  }

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
      ...computePhotoStatus(place.photoCount)
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
      status: normalizeStatus('unknown'),
      detail: 'Google Places does not expose service descriptions. Confirm each service has on-brand copy inside GBP.'
    },
    {
      id: 'update-posts',
      label: 'Post weekly updates',
      weight: 7,
      auto: false,
      status: normalizeStatus('unknown'),
      detail: 'Google Places does not surface post frequency. Maintain a weekly cadence manually.'
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
      ...computeReviewStatus(place.reviewCount)
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

  return {
    place,
    tasks,
    automatedWeight,
    manualWeight,
    completedWeight,
    progressPercent
  };
}
