# 1. Build the Go application
FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# Versie in het binary (de box meldt hem aan PocketBase). De build-context
# heeft geen .git, dus van buiten: AGENT_VERSION=$(git describe --always --dirty).
ARG AGENT_VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s -X main.version=${AGENT_VERSION}" -o agent ./main/main.go

# 2. Create the final runtime image
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/agent .

CMD ["./agent"]
