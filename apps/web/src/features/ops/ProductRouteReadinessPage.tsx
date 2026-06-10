import type { ProductRouteReadinessResponse } from "@cf/shared";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useProductRouteReadiness } from "./hooks.js";

type Route = ProductRouteReadinessResponse["routes"][number];

const ENDPOINT = "/api/execution/ops/product-route-readiness";

function tone(ok: boolean) {
  return ok ? "success" : "danger";
}

function readinessLabel(ok: boolean) {
  return ok ? "ready" : "blocked";
}

function ValueList({ items }: { items: string[] }) {
  return (
    <ul className="ops-compact-list product-route-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function EndpointList({ endpoints }: { endpoints: string[] }) {
  return (
    <div className="product-route-endpoints">
      {endpoints.map((endpoint) => (
        <code key={endpoint} className="ops-endpoint">{endpoint}</code>
      ))}
    </div>
  );
}

function Summary({ readiness }: { readiness: ProductRouteReadinessResponse }) {
  const productionReadyCount = readiness.routes.filter((route) => route.production_ready).length;
  return (
    <div className="kpi-grid ops-kpi-grid product-route-kpi-grid">
      <div className="card kpi">
        <div className={`badge ${tone(readiness.ready)}`}>{readiness.status}</div>
        <div className="kpi-label">Route readiness</div>
      </div>
      <div className="card kpi">
        <div className="badge info">{readiness.route_count}</div>
        <div className="kpi-label">Tracked routes</div>
      </div>
      <div className="card kpi">
        <div className="badge success">{readiness.routes.filter((route) => route.mvp_ready).length}</div>
        <div className="kpi-label">MVP foundations</div>
      </div>
      <div className="card kpi">
        <div className={`badge ${tone(productionReadyCount === readiness.route_count)}`}>
          {productionReadyCount}
        </div>
        <div className="kpi-label">Production-complete routes</div>
      </div>
    </div>
  );
}

function RouteCard({ route }: { route: Route }) {
  return (
    <section className="card ops-drilldown-card product-route-card">
      <div className="ops-card-head">
        <div>
          <h2>{route.title}</h2>
          <p>{route.key}</p>
        </div>
        <div className="product-route-badges">
          <span className={`badge ${tone(route.mvp_ready)}`}>MVP {readinessLabel(route.mvp_ready)}</span>
          <span className={`badge ${tone(route.production_ready)}`}>
            Production {readinessLabel(route.production_ready)}
          </span>
        </div>
      </div>
      <div className="ops-drilldown-grid product-route-detail-grid">
        <div>
          <h3>Evidence</h3>
          <EndpointList endpoints={route.evidence_endpoints} />
        </div>
        <div>
          <h3>Delivered</h3>
          <ValueList items={route.delivered_capabilities} />
        </div>
        <div>
          <h3>Missing</h3>
          <ValueList items={route.missing_product_requirements} />
        </div>
        <div>
          <h3>Boundary</h3>
          <ValueList items={route.safety_boundaries} />
        </div>
      </div>
    </section>
  );
}

export function ProductRouteReadinessPage() {
  const { data, isLoading, isError, error } = useProductRouteReadiness();

  return (
    <div className="product-route-readiness">
      <div className="page-head">
        <div>
          <h1>产品路线收口</h1>
          <p>只读展示 Final RC 后 5 条独立产品路线的交付证据、生产缺口和安全边界</p>
        </div>
      </div>

      {isError && <ErrorBar message={`产品路线收口加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary readiness={data} />
          <section className="card product-route-source-card">
            <div className="ops-card-head">
              <h2>Readiness source</h2>
              <span className={`badge ${tone(data.ready)}`}>{data.mode}</span>
            </div>
            <code className="ops-endpoint">{ENDPOINT}</code>
          </section>
          <div className="product-route-grid">
            {data.routes.map((route) => (
              <RouteCard key={route.key} route={route} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
