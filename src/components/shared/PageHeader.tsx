import { Breadcrumbs } from "./Breadcrumbs";
import { BackButton } from "./BackButton";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Show back button — pass string for specific route, true for history back */
  backTo?: string | boolean;
  /** Hide breadcrumbs */
  hideBreadcrumbs?: boolean;
  /** Use gradient text for the title */
  gradient?: boolean;
  className?: string;
}

export function PageHeader({ 
  title, 
  description, 
  actions, 
  backTo, 
  hideBreadcrumbs, 
  gradient = true,
  className
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4 mb-8", className)}>
      {!hideBreadcrumbs && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
          <Breadcrumbs />
        </div>
      )}
      
      {backTo && (
        <BackButton to={typeof backTo === "string" ? backTo : undefined} />
      )}
      
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <h1 className={cn(
            "text-3xl sm:text-4xl lg:text-5xl font-heading font-black tracking-tight",
            gradient ? "nexus-gradient-text" : "text-foreground"
          )}>
            {title}
          </h1>
          {description && (
            <p className="text-title-sm text-muted-foreground max-w-2xl font-medium leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3 mt-2 lg:mt-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
