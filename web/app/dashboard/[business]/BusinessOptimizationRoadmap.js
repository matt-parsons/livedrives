import Link from 'next/link';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Divider,
  Progress,
  ScrollShadow
} from '@heroui/react';

function formatImpact(weight) {
  if (weight === null || weight === undefined) {
    return null;
  }

  const value = Number(weight);

  if (!Number.isFinite(value)) {
    return null;
  }

  return `${value}% impact`;
}

function resolveStatusColor(statusKey) {
  if (!statusKey) return 'default';
  const normalized = statusKey.toString().toLowerCase();
  if (normalized.includes('complete') || normalized.includes('good') || normalized.includes('pass')) {
    return 'success';
  }
  if (normalized.includes('progress')) {
    return 'warning';
  }
  if (normalized.includes('risk') || normalized.includes('block') || normalized.includes('fail')) {
    return 'danger';
  }
  return 'secondary';
}

function RoadmapTaskCard({ task }) {
  const impactLabel = formatImpact(task.weight);
  const statusColor = resolveStatusColor(task.status?.key);

  return (
    <Card key={task.id} radius="lg" variant="bordered" className="border-content3/40 bg-content1/80">
      <CardHeader className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-base font-semibold text-foreground">{task.label}</h4>
          {task.detail ? <p className="text-sm text-foreground/60">{task.detail}</p> : null}
        </div>
        {task.status ? (
          <Chip color={statusColor} variant="flat" className="font-semibold">
            {task.status.label}
          </Chip>
        ) : null}
      </CardHeader>
      <Divider />
      <CardBody className="flex flex-col gap-2 text-sm text-foreground/70">
        <span>{task.auto ? 'Automatically scored' : 'Manual follow-up required'}</span>
        {impactLabel ? (
          <Chip color="secondary" variant="flat" size="sm" className="self-start font-semibold">
            {impactLabel}
          </Chip>
        ) : null}
      </CardBody>
      <CardFooter className="text-xs text-foreground/50">
        {task.category ? `Category: ${task.category}` : 'Optimization signal'}
      </CardFooter>
    </Card>
  );
}

export default function BusinessOptimizationRoadmap({ roadmap, error, placeId, editHref }) {
  if (!placeId) {
    return (
      <Card className="border border-dashed border-content3/50 bg-content2/70">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Optimization roadmap</h2>
            <p className="text-sm text-foreground/70">Connect a Google Place ID to unlock optimization guidance.</p>
          </div>
          <Button as={Link} href={editHref ?? 'edit'} color="primary" variant="flat">
            Add Google Place ID
          </Button>
        </CardHeader>
        <Divider />
        <CardBody className="text-sm text-foreground/70">
          This business isn’t linked to Google Places yet. Once a Place ID is connected we’ll evaluate the profile’s
          completeness and highlight the quickest wins.
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-danger/40 bg-danger-50/30">
        <CardHeader>
          <h2 className="text-xl font-semibold text-danger-600">Optimization roadmap</h2>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-2 text-sm text-danger-700">
          <p className="font-semibold">Unable to contact Google Places</p>
          <p>{error}</p>
        </CardBody>
      </Card>
    );
  }

  if (!roadmap) {
    return null;
  }

  const autoTasks = roadmap.tasks.filter((task) => task.auto);
  const manualTasks = roadmap.tasks.filter((task) => !task.auto);

  return (
    <Card className="border border-content3/40 bg-content1/90 shadow-large">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Optimization roadmap</h2>
          <p className="text-sm text-foreground/60">
            We analyse Google Places data to prioritize the biggest profile wins.
          </p>
        </div>
        {roadmap.place?.googleMapsUri ? (
          <Button
            as={Link}
            href={roadmap.place.googleMapsUri}
            target="_blank"
            rel="noopener noreferrer"
            variant="bordered"
          >
            View on Google Maps
          </Button>
        ) : null}
      </CardHeader>
      <Divider />
      <CardBody className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
              Optimization readiness
            </span>
            <span className="text-sm font-semibold text-foreground/70">{roadmap.progressPercent}% complete</span>
          </div>
          <Progress
            size="lg"
            aria-label="Optimization readiness"
            value={Math.min(100, Math.max(0, roadmap.progressPercent))}
            color="secondary"
            showValueLabel={false}
            className="max-w-lg"
          />
          <p className="text-sm text-foreground/60">
            Automated checks cover {roadmap.automatedWeight}% of the roadmap. Manual follow-ups account for the remaining
            {` ${roadmap.manualWeight}%`}.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Automated insights</h3>
            {autoTasks.length ? (
              <ScrollShadow className="grid gap-3">
                {autoTasks.map((task) => (
                  <RoadmapTaskCard key={task.id} task={task} />
                ))}
              </ScrollShadow>
            ) : (
              <p className="text-sm text-foreground/60">
                No automated signals detected. Double-check that the Place ID is correct and try again.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Manual priorities</h3>
            {manualTasks.length ? (
              <ScrollShadow className="grid gap-3">
                {manualTasks.map((task) => (
                  <RoadmapTaskCard key={task.id} task={task} />
                ))}
              </ScrollShadow>
            ) : (
              <p className="text-sm text-foreground/60">
                No manual priorities queued yet. Review your Google profile and re-run the analysis for fresh
                opportunities.
              </p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
