package app

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRetryWithBackoffSucceedsAfterFailures(t *testing.T) {
	attempts := 0
	ok := retryWithBackoff(context.Background(), time.Millisecond, 4*time.Millisecond, func() error {
		attempts++
		if attempts < 3 {
			return errors.New("pocketbase weg")
		}
		return nil
	})
	if !ok || attempts != 3 {
		t.Errorf("ok = %v, attempts = %d, want true, 3", ok, attempts)
	}
}

func TestRetryWithBackoffStopsOnCancel(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	start := time.Now()
	ok := retryWithBackoff(ctx, time.Millisecond, 5*time.Millisecond, func() error {
		return errors.New("pocketbase weg")
	})
	if ok {
		t.Error("ok = true, want false na annuleren")
	}
	if elapsed := time.Since(start); elapsed > 200*time.Millisecond {
		t.Errorf("stopte pas na %s", elapsed)
	}
}

// De wachttijd verdubbelt maar blijft onder maxWait: met min 10 ms en max
// 20 ms duren vijf mislukte pogingen 10+20+20+20 = 70 ms, niet 10+20+40+80.
func TestRetryWithBackoffCapsWait(t *testing.T) {
	attempts := 0
	start := time.Now()
	retryWithBackoff(context.Background(), 10*time.Millisecond, 20*time.Millisecond, func() error {
		attempts++
		if attempts < 5 {
			return errors.New("pocketbase weg")
		}
		return nil
	})
	elapsed := time.Since(start)
	if elapsed < 70*time.Millisecond || elapsed > 140*time.Millisecond {
		t.Errorf("vijf pogingen duurden %s, want ~70ms", elapsed)
	}
}
