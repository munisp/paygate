package redis

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

func NewClient(url string) *Client {
	opts, err := redis.ParseURL(url)
	if err != nil {
		panic("invalid redis URL: " + err.Error())
	}
	return &Client{rdb: redis.NewClient(opts)}
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

func (c *Client) SetEX(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.rdb.SetEx(ctx, key, value, ttl).Err()
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	n, err := c.rdb.Exists(ctx, key).Result()
	return n > 0, err
}

func (c *Client) IncrBy(ctx context.Context, key string, delta int64) (int64, error) {
	return c.rdb.IncrBy(ctx, key, delta).Result()
}

func (c *Client) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return c.rdb.Expire(ctx, key, ttl).Err()
}

func (c *Client) HSet(ctx context.Context, key string, fields map[string]interface{}) error {
	return c.rdb.HSet(ctx, key, fields).Err()
}

func (c *Client) HGetAll(ctx context.Context, key string) (map[string]string, error) {
	return c.rdb.HGetAll(ctx, key).Result()
}
