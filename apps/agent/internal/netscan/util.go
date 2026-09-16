package netscan

import (
	"context"
	"errors"
	"syscall"
	"time"
)

func contextWithTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}

// isRefused reports whether an error is a TCP connection-refused, which still
// proves the target host is alive (something answered with a RST).
func isRefused(err error) bool {
	return errors.Is(err, syscall.ECONNREFUSED)
}

func round(val float64, precision int) float64 {
	p := 1.0
	for i := 0; i < precision; i++ {
		p *= 10.0
	}
	return float64(int(val*p+0.5)) / p
}
