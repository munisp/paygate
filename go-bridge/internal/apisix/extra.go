package apisix

// extra.go — Additional APISIX client methods used by apisix_admin.go handlers.
// Split into a separate file to avoid modifying the large client.go.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// IsEnabled returns true when the APISIX admin API is reachable.
func (c *Client) IsEnabled() bool {
	return c.enabled
}

// ListConsumers returns all APISIX consumers.
func (c *Client) ListConsumers(ctx context.Context) ([]Consumer, error) {
	if !c.enabled {
		return []Consumer{}, nil
	}
	data, status, err := c.do(ctx, http.MethodGet, "/apisix/admin/consumers", nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("apisix: list consumers %d: %s", status, data)
	}
	var envelope struct {
		List []struct {
			Value Consumer `json:"value"`
		} `json:"list"`
	}
	if err2 := json.Unmarshal(data, &envelope); err2 != nil {
		return nil, fmt.Errorf("decode consumers: %w", err2)
	}
	out := make([]Consumer, 0, len(envelope.List))
	for _, item := range envelope.List {
		out = append(out, item.Value)
	}
	return out, nil
}

// ListPlugins returns the list of available APISIX plugin names.
func (c *Client) ListPlugins(ctx context.Context) ([]string, error) {
	if !c.enabled {
		return []string{"key-auth", "jwt-auth", "rate-limiting", "cors", "ip-restriction", "opentelemetry"}, nil
	}
	data, status, err := c.do(ctx, http.MethodGet, "/apisix/admin/plugins/list", nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("apisix: list plugins %d: %s", status, data)
	}
	var plugins []string
	if err2 := json.Unmarshal(data, &plugins); err2 != nil {
		return nil, fmt.Errorf("decode plugins: %w", err2)
	}
	return plugins, nil
}

// EnablePlugin adds or updates a plugin configuration on an existing route.
func (c *Client) EnablePlugin(ctx context.Context, routeID, pluginName string, config map[string]interface{}) error {
	if !c.enabled {
		return nil
	}
	routes, err := c.ListRoutes(ctx)
	if err != nil {
		return fmt.Errorf("fetch routes: %w", err)
	}
	var target *Route
	for i := range routes {
		if routes[i].ID == routeID {
			target = &routes[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("route %q not found", routeID)
	}
	if target.Plugins == nil {
		target.Plugins = make(map[string]interface{})
	}
	if config == nil {
		config = map[string]interface{}{}
	}
	target.Plugins[pluginName] = config
	return c.UpsertRoute(ctx, *target)
}

// DisablePlugin removes a plugin from an existing route.
func (c *Client) DisablePlugin(ctx context.Context, routeID, pluginName string) error {
	if !c.enabled {
		return nil
	}
	routes, err := c.ListRoutes(ctx)
	if err != nil {
		return fmt.Errorf("fetch routes: %w", err)
	}
	var target *Route
	for i := range routes {
		if routes[i].ID == routeID {
			target = &routes[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("route %q not found", routeID)
	}
	delete(target.Plugins, pluginName)
	return c.UpsertRoute(ctx, *target)
}
