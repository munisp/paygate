package dapr

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client wraps Dapr HTTP service invocation.
type Client struct {
	appID    string
	httpPort string
	http     *http.Client
}

func NewClient(appID, httpPort string) *Client {
	return &Client{
		appID:    appID,
		httpPort: httpPort,
		http: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// InvokeMethod calls a method on a Dapr-enabled service.
func (c *Client) InvokeMethod(
	ctx context.Context,
	appID, method, verb string,
	body []byte,
) ([]byte, error) {
	url := fmt.Sprintf("http://localhost:%s/v1.0/invoke/%s/method/%s", c.httpPort, appID, method)

	req, err := http.NewRequestWithContext(ctx, verb, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create dapr request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("dapr invoke %s/%s: %w", appID, method, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read dapr response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("dapr invoke %s/%s returned %d: %s", appID, method, resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// PublishEvent publishes a CloudEvent to a Dapr pub/sub component.
func (c *Client) PublishEvent(
	ctx context.Context,
	pubsubName, topic string,
	data []byte,
) error {
	url := fmt.Sprintf("http://localhost:%s/v1.0/publish/%s/%s", c.httpPort, pubsubName, topic)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create dapr publish request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("dapr publish %s/%s: %w", pubsubName, topic, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dapr publish returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
