// Package prismer provides the official Go SDK for Prismer Cloud API.
//
// Covers Context API, Parse API, and IM API with sub-module access pattern.
//
// Example:
//
//	client := prismer.NewClient("sk-prismer-...")
//
//	// Context API
//	result, _ := client.Load(ctx, "https://example.com", nil)
//
//	// Parse API
//	pdf, _ := client.ParsePDF(ctx, "https://arxiv.org/pdf/2401.00001.pdf", "fast")
//
//	// IM API (sub-module pattern)
//	reg, _ := client.IM().Account.Register(ctx, &prismer.IMRegisterOptions{...})
//	client.IM().Direct.Send(ctx, "user-123", "Hello!", nil)
//	client.IM().Groups.List(ctx)
//	client.IM().Conversations.List(ctx, false, false)
package prismer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ============================================================================
// Environment
// ============================================================================

type Environment string

const (
	Production Environment = "production"
)

var environments = map[Environment]string{
	Production: "https://prismer.cloud",
}

const (
	DefaultBaseURL = "https://prismer.cloud"
	DefaultTimeout = 30 * time.Second
)

// ============================================================================
// Client
// ============================================================================

type Client struct {
	apiKey     string
	baseURL    string
	imAgent    string
	httpClient *http.Client
	im         *IMClient
}

type ClientOption func(*Client)

func WithBaseURL(url string) ClientOption {
	return func(c *Client) { c.baseURL = strings.TrimRight(url, "/") }
}

func WithEnvironment(env Environment) ClientOption {
	return func(c *Client) {
		if u, ok := environments[env]; ok {
			c.baseURL = u
		}
	}
}

func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) { c.httpClient.Timeout = timeout }
}

func WithHTTPClient(client *http.Client) ClientOption {
	return func(c *Client) { c.httpClient = client }
}

func WithIMAgent(agent string) ClientOption {
	return func(c *Client) { c.imAgent = agent }
}

// NewClient creates a new Prismer client.
// apiKey is optional — pass "" for anonymous IM registration.
func NewClient(apiKey string, opts ...ClientOption) *Client {
	c := &Client{
		apiKey:  apiKey,
		baseURL: DefaultBaseURL,
		httpClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}

	for _, opt := range opts {
		opt(c)
	}

	c.im = newIMClient(c)
	return c
}

// SetToken sets or updates the auth token (API key or IM JWT).
// Useful after anonymous registration to set the returned JWT.
func (c *Client) SetToken(token string) {
	c.apiKey = token
}

// IM returns the IM API sub-client.
func (c *Client) IM() *IMClient {
	return c.im
}

// ============================================================================
// Internal request helper
// ============================================================================

func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}, query map[string]string) ([]byte, error) {
	u := c.baseURL + path
	if len(query) > 0 {
		params := url.Values{}
		for k, v := range query {
			params.Set(k, v)
		}
		u += "?" + params.Encode()
	}

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	if c.imAgent != "" {
		req.Header.Set("X-IM-Agent", c.imAgent)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}

func decodeJSON[T any](data []byte) (*T, error) {
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}
	return &result, nil
}

// ============================================================================
// Context API Methods
// ============================================================================

func (c *Client) Load(ctx context.Context, input interface{}, opts *LoadOptions) (*LoadResult, error) {
	payload := map[string]interface{}{"input": input}
	if opts != nil {
		if opts.InputType != "" {
			payload["inputType"] = opts.InputType
		}
		if opts.ProcessUncached {
			payload["processUncached"] = true
		}
		if opts.Search != nil {
			payload["search"] = opts.Search
		}
		if opts.Processing != nil {
			payload["processing"] = opts.Processing
		}
		if opts.Return != nil {
			payload["return"] = opts.Return
		}
		if opts.Ranking != nil {
			payload["ranking"] = opts.Ranking
		}
	}
	data, err := c.doRequest(ctx, "POST", "/api/context/load", payload, nil)
	if err != nil {
		return nil, err
	}
	return decodeJSON[LoadResult](data)
}

func (c *Client) Save(ctx context.Context, opts *SaveOptions) (*SaveResult, error) {
	if opts == nil || opts.URL == "" || opts.HQCC == "" {
		return &SaveResult{
			Success: false,
			Error:   &APIError{Code: "INVALID_INPUT", Message: "url and hqcc are required"},
		}, nil
	}
	data, err := c.doRequest(ctx, "POST", "/api/context/save", opts, nil)
	if err != nil {
		return nil, err
	}
	return decodeJSON[SaveResult](data)
}

func (c *Client) SaveBatch(ctx context.Context, opts *SaveBatchOptions) (*SaveResult, error) {
	if opts == nil || len(opts.Items) == 0 {
		return &SaveResult{
			Success: false,
			Error:   &APIError{Code: "INVALID_INPUT", Message: "items are required"},
		}, nil
	}
	if len(opts.Items) > 50 {
		return &SaveResult{
			Success: false,
			Error:   &APIError{Code: "BATCH_TOO_LARGE", Message: "Maximum 50 items per batch request"},
		}, nil
	}
	data, err := c.doRequest(ctx, "POST", "/api/context/save", opts, nil)
	if err != nil {
		return nil, err
	}
	return decodeJSON[SaveResult](data)
}

// ============================================================================
// Parse API Methods
// ============================================================================

func (c *Client) Parse(ctx context.Context, opts *ParseOptions) (*ParseResult, error) {
	if opts == nil {
		return &ParseResult{Success: false, Error: &APIError{Code: "INVALID_INPUT", Message: "options required"}}, nil
	}
	data, err := c.doRequest(ctx, "POST", "/api/parse", opts, nil)
	if err != nil {
		return nil, err
	}
	return decodeJSON[ParseResult](data)
}

func (c *Client) ParsePDF(ctx context.Context, pdfURL string, mode string) (*ParseResult, error) {
	if mode == "" {
		mode = "fast"
	}
	return c.Parse(ctx, &ParseOptions{URL: pdfURL, Mode: mode})
}

func (c *Client) ParseStatus(ctx context.Context, taskID string) (*ParseResult, error) {
	data, err := c.doRequest(ctx, "GET", "/api/parse/status/"+taskID, nil, nil)
	if err != nil {
		return nil, err
	}
	return decodeJSON[ParseResult](data)
}

func (c *Client) ParseResultByID(ctx context.Context, taskID string) (*ParseResult, error) {
	data, err := c.doRequest(ctx, "GET", "/api/parse/result/"+taskID, nil, nil)
	if err != nil {
		return nil, err
	}
	return decodeJSON[ParseResult](data)
}

func (c *Client) Search(ctx context.Context, query string, opts *SearchOptions) (*LoadResult, error) {
	loadOpts := &LoadOptions{InputType: "query"}
	if opts != nil {
		if opts.TopK > 0 {
			loadOpts.Search = &SearchConfig{TopK: opts.TopK}
		}
		if opts.ReturnTopK > 0 || opts.Format != "" {
			loadOpts.Return = &ReturnConfig{TopK: opts.ReturnTopK, Format: opts.Format}
		}
		if opts.Ranking != "" {
			loadOpts.Ranking = &RankingConfig{Preset: opts.Ranking}
		}
	}
	return c.Load(ctx, query, loadOpts)
}

// ============================================================================
// IM Client (orchestrates sub-modules)
// ============================================================================

// IMClient provides access to the IM API via sub-modules.
type IMClient struct {
	client *Client

	Account       *AccountClient
	Direct        *DirectClient
	Groups        *GroupsClient
	Conversations *ConversationsClient
	Messages      *MessagesClient
	Contacts      *ContactsClient
	Bindings      *BindingsClient
	Credits       *CreditsClient
	Workspace     *WorkspaceClient
	Files         *FilesClient
	Realtime      *IMRealtimeClient
}

func newIMClient(c *Client) *IMClient {
	im := &IMClient{client: c}
	im.Account = &AccountClient{im: im}
	im.Direct = &DirectClient{im: im}
	im.Groups = &GroupsClient{im: im}
	im.Conversations = &ConversationsClient{im: im}
	im.Messages = &MessagesClient{im: im}
	im.Contacts = &ContactsClient{im: im}
	im.Bindings = &BindingsClient{im: im}
	im.Credits = &CreditsClient{im: im}
	im.Workspace = &WorkspaceClient{im: im}
	im.Files = &FilesClient{im: im}
	im.Realtime = &IMRealtimeClient{im: im}
	return im
}

func (im *IMClient) do(ctx context.Context, method, path string, body interface{}, query map[string]string) (*IMResult, error) {
	data, err := im.client.doRequest(ctx, method, path, body, query)
	if err != nil {
		return nil, err
	}
	return decodeJSON[IMResult](data)
}

// Health checks IM service health.
func (im *IMClient) Health(ctx context.Context) (*IMResult, error) {
	return im.do(ctx, "GET", "/api/im/health", nil, nil)
}

func paginationQuery(opts *IMPaginationOptions) map[string]string {
	if opts == nil {
		return nil
	}
	q := map[string]string{}
	if opts.Limit > 0 {
		q["limit"] = fmt.Sprintf("%d", opts.Limit)
	}
	if opts.Offset > 0 {
		q["offset"] = fmt.Sprintf("%d", opts.Offset)
	}
	if len(q) == 0 {
		return nil
	}
	return q
}

func sendPayload(content string, opts *IMSendOptions) map[string]interface{} {
	payload := map[string]interface{}{"content": content, "type": "text"}
	if opts != nil {
		if opts.Type != "" {
			payload["type"] = opts.Type
		}
		if opts.Metadata != nil {
			payload["metadata"] = opts.Metadata
		}
		if opts.ParentID != "" {
			payload["parentId"] = opts.ParentID
		}
	}
	return payload
}

// ============================================================================
// IM Sub-Clients
// ============================================================================

// AccountClient handles registration and identity.
type AccountClient struct{ im *IMClient }

func (a *AccountClient) Register(ctx context.Context, opts *IMRegisterOptions) (*IMResult, error) {
	return a.im.do(ctx, "POST", "/api/im/register", opts, nil)
}

func (a *AccountClient) Me(ctx context.Context) (*IMResult, error) {
	return a.im.do(ctx, "GET", "/api/im/me", nil, nil)
}

func (a *AccountClient) RefreshToken(ctx context.Context) (*IMResult, error) {
	return a.im.do(ctx, "POST", "/api/im/token/refresh", nil, nil)
}

// DirectClient handles direct messaging.
type DirectClient struct{ im *IMClient }

func (d *DirectClient) Send(ctx context.Context, userID, content string, opts *IMSendOptions) (*IMResult, error) {
	return d.im.do(ctx, "POST", "/api/im/direct/"+userID+"/messages", sendPayload(content, opts), nil)
}

func (d *DirectClient) GetMessages(ctx context.Context, userID string, opts *IMPaginationOptions) (*IMResult, error) {
	return d.im.do(ctx, "GET", "/api/im/direct/"+userID+"/messages", nil, paginationQuery(opts))
}

// GroupsClient handles group management and messaging.
type GroupsClient struct{ im *IMClient }

func (g *GroupsClient) Create(ctx context.Context, opts *IMCreateGroupOptions) (*IMResult, error) {
	return g.im.do(ctx, "POST", "/api/im/groups", opts, nil)
}

func (g *GroupsClient) List(ctx context.Context) (*IMResult, error) {
	return g.im.do(ctx, "GET", "/api/im/groups", nil, nil)
}

func (g *GroupsClient) Get(ctx context.Context, groupID string) (*IMResult, error) {
	return g.im.do(ctx, "GET", "/api/im/groups/"+groupID, nil, nil)
}

func (g *GroupsClient) Send(ctx context.Context, groupID, content string, opts *IMSendOptions) (*IMResult, error) {
	return g.im.do(ctx, "POST", "/api/im/groups/"+groupID+"/messages", sendPayload(content, opts), nil)
}

func (g *GroupsClient) GetMessages(ctx context.Context, groupID string, opts *IMPaginationOptions) (*IMResult, error) {
	return g.im.do(ctx, "GET", "/api/im/groups/"+groupID+"/messages", nil, paginationQuery(opts))
}

func (g *GroupsClient) AddMember(ctx context.Context, groupID, userID string) (*IMResult, error) {
	return g.im.do(ctx, "POST", "/api/im/groups/"+groupID+"/members", map[string]string{"userId": userID}, nil)
}

func (g *GroupsClient) RemoveMember(ctx context.Context, groupID, userID string) (*IMResult, error) {
	return g.im.do(ctx, "DELETE", "/api/im/groups/"+groupID+"/members/"+userID, nil, nil)
}

// ConversationsClient handles conversation management.
type ConversationsClient struct{ im *IMClient }

func (cv *ConversationsClient) List(ctx context.Context, withUnread, unreadOnly bool) (*IMResult, error) {
	var query map[string]string
	if withUnread || unreadOnly {
		query = map[string]string{}
		if withUnread {
			query["withUnread"] = "true"
		}
		if unreadOnly {
			query["unreadOnly"] = "true"
		}
	}
	return cv.im.do(ctx, "GET", "/api/im/conversations", nil, query)
}

func (cv *ConversationsClient) Get(ctx context.Context, conversationID string) (*IMResult, error) {
	return cv.im.do(ctx, "GET", "/api/im/conversations/"+conversationID, nil, nil)
}

func (cv *ConversationsClient) CreateDirect(ctx context.Context, userID string) (*IMResult, error) {
	return cv.im.do(ctx, "POST", "/api/im/conversations/direct", map[string]string{"userId": userID}, nil)
}

func (cv *ConversationsClient) MarkAsRead(ctx context.Context, conversationID string) (*IMResult, error) {
	return cv.im.do(ctx, "POST", "/api/im/conversations/"+conversationID+"/read", nil, nil)
}

// MessagesClient handles low-level message operations.
type MessagesClient struct{ im *IMClient }

func (m *MessagesClient) Send(ctx context.Context, conversationID, content string, opts *IMSendOptions) (*IMResult, error) {
	return m.im.do(ctx, "POST", "/api/im/messages/"+conversationID, sendPayload(content, opts), nil)
}

func (m *MessagesClient) GetHistory(ctx context.Context, conversationID string, opts *IMPaginationOptions) (*IMResult, error) {
	return m.im.do(ctx, "GET", "/api/im/messages/"+conversationID, nil, paginationQuery(opts))
}

func (m *MessagesClient) Edit(ctx context.Context, conversationID, messageID, content string) (*IMResult, error) {
	return m.im.do(ctx, "PATCH", "/api/im/messages/"+conversationID+"/"+messageID, map[string]string{"content": content}, nil)
}

func (m *MessagesClient) Delete(ctx context.Context, conversationID, messageID string) (*IMResult, error) {
	return m.im.do(ctx, "DELETE", "/api/im/messages/"+conversationID+"/"+messageID, nil, nil)
}

// ContactsClient handles contacts and agent discovery.
type ContactsClient struct{ im *IMClient }

func (c *ContactsClient) List(ctx context.Context) (*IMResult, error) {
	return c.im.do(ctx, "GET", "/api/im/contacts", nil, nil)
}

func (c *ContactsClient) Discover(ctx context.Context, opts *IMDiscoverOptions) (*IMResult, error) {
	var query map[string]string
	if opts != nil {
		query = map[string]string{}
		if opts.Type != "" {
			query["type"] = opts.Type
		}
		if opts.Capability != "" {
			query["capability"] = opts.Capability
		}
		if len(query) == 0 {
			query = nil
		}
	}
	return c.im.do(ctx, "GET", "/api/im/discover", nil, query)
}

// BindingsClient handles social bindings.
type BindingsClient struct{ im *IMClient }

func (b *BindingsClient) Create(ctx context.Context, opts *IMCreateBindingOptions) (*IMResult, error) {
	return b.im.do(ctx, "POST", "/api/im/bindings", opts, nil)
}

func (b *BindingsClient) Verify(ctx context.Context, bindingID, code string) (*IMResult, error) {
	return b.im.do(ctx, "POST", "/api/im/bindings/"+bindingID+"/verify", map[string]string{"code": code}, nil)
}

func (b *BindingsClient) List(ctx context.Context) (*IMResult, error) {
	return b.im.do(ctx, "GET", "/api/im/bindings", nil, nil)
}

func (b *BindingsClient) Delete(ctx context.Context, bindingID string) (*IMResult, error) {
	return b.im.do(ctx, "DELETE", "/api/im/bindings/"+bindingID, nil, nil)
}

// CreditsClient handles credits and transactions.
type CreditsClient struct{ im *IMClient }

func (cr *CreditsClient) Get(ctx context.Context) (*IMResult, error) {
	return cr.im.do(ctx, "GET", "/api/im/credits", nil, nil)
}

func (cr *CreditsClient) Transactions(ctx context.Context, opts *IMPaginationOptions) (*IMResult, error) {
	return cr.im.do(ctx, "GET", "/api/im/credits/transactions", nil, paginationQuery(opts))
}

// WorkspaceClient handles workspace management.
type WorkspaceClient struct{ im *IMClient }

func (w *WorkspaceClient) Init(ctx context.Context, opts *IMWorkspaceInitOptions) (*IMResult, error) {
	return w.im.do(ctx, "POST", "/api/im/workspace/init", opts, nil)
}

func (w *WorkspaceClient) InitGroup(ctx context.Context, opts *IMWorkspaceInitGroupOptions) (*IMResult, error) {
	return w.im.do(ctx, "POST", "/api/im/workspace/init-group", opts, nil)
}

func (w *WorkspaceClient) AddAgent(ctx context.Context, workspaceID, agentID string) (*IMResult, error) {
	return w.im.do(ctx, "POST", "/api/im/workspace/"+workspaceID+"/agents", map[string]string{"agentId": agentID}, nil)
}

func (w *WorkspaceClient) ListAgents(ctx context.Context, workspaceID string) (*IMResult, error) {
	return w.im.do(ctx, "GET", "/api/im/workspace/"+workspaceID+"/agents", nil, nil)
}

func (w *WorkspaceClient) MentionAutocomplete(ctx context.Context, conversationID string, query string) (*IMResult, error) {
	q := map[string]string{"conversationId": conversationID}
	if query != "" {
		q["q"] = query
	}
	return w.im.do(ctx, "GET", "/api/im/workspace/mentions/autocomplete", nil, q)
}

// FilesClient handles file upload management.
type FilesClient struct{ im *IMClient }

// Presign gets a presigned upload URL.
func (f *FilesClient) Presign(ctx context.Context, opts *IMPresignOptions) (*IMResult, error) {
	return f.im.do(ctx, "POST", "/api/im/files/presign", opts, nil)
}

// Confirm confirms an uploaded file (triggers validation + CDN activation).
func (f *FilesClient) Confirm(ctx context.Context, uploadID string) (*IMResult, error) {
	return f.im.do(ctx, "POST", "/api/im/files/confirm", map[string]string{"uploadId": uploadID}, nil)
}

// Quota returns storage quota.
func (f *FilesClient) Quota(ctx context.Context) (*IMResult, error) {
	return f.im.do(ctx, "GET", "/api/im/files/quota", nil, nil)
}

// Delete deletes a file.
func (f *FilesClient) Delete(ctx context.Context, uploadID string) (*IMResult, error) {
	return f.im.do(ctx, "DELETE", "/api/im/files/"+uploadID, nil, nil)
}

// Types returns allowed MIME types.
func (f *FilesClient) Types(ctx context.Context) (*IMResult, error) {
	return f.im.do(ctx, "GET", "/api/im/files/types", nil, nil)
}

// InitMultipart initializes a multipart upload (for files > 10 MB).
func (f *FilesClient) InitMultipart(ctx context.Context, opts *IMPresignOptions) (*IMResult, error) {
	return f.im.do(ctx, "POST", "/api/im/files/upload/init", opts, nil)
}

// CompleteMultipart completes a multipart upload.
func (f *FilesClient) CompleteMultipart(ctx context.Context, uploadID string, parts []IMCompletedPart) (*IMResult, error) {
	return f.im.do(ctx, "POST", "/api/im/files/upload/complete", map[string]interface{}{
		"uploadId": uploadID, "parts": parts,
	}, nil)
}

// Upload uploads a file from bytes (full lifecycle: presign → upload → confirm).
// FileName in opts is required.
func (f *FilesClient) Upload(ctx context.Context, data []byte, opts *UploadOptions) (*IMConfirmResult, error) {
	if opts == nil || opts.FileName == "" {
		return nil, fmt.Errorf("fileName is required when uploading bytes")
	}
	fileName := opts.FileName
	mimeType := opts.MimeType
	if mimeType == "" {
		mimeType = guessMimeType(fileName)
	}
	fileSize := int64(len(data))

	if fileSize > 50*1024*1024 {
		return nil, fmt.Errorf("file exceeds maximum size of 50 MB")
	}

	if fileSize <= 10*1024*1024 {
		return f.uploadSimple(ctx, data, fileName, fileSize, mimeType, opts.OnProgress)
	}
	return f.uploadMultipart(ctx, data, fileName, fileSize, mimeType, opts.OnProgress)
}

// UploadFile uploads a file from a local path.
// FileName and MimeType in opts are auto-detected from the path if not set.
func (f *FilesClient) UploadFile(ctx context.Context, filePath string, opts *UploadOptions) (*IMConfirmResult, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	if opts == nil {
		opts = &UploadOptions{}
	}
	if opts.FileName == "" {
		opts.FileName = filepath.Base(filePath)
	}
	return f.Upload(ctx, data, opts)
}

// SendFile uploads a file and sends it as a message in one call.
func (f *FilesClient) SendFile(ctx context.Context, conversationID string, data []byte, opts *SendFileOptions) (*SendFileResult, error) {
	if opts == nil || opts.FileName == "" {
		return nil, fmt.Errorf("fileName is required")
	}

	uploaded, err := f.Upload(ctx, data, &UploadOptions{
		FileName:   opts.FileName,
		MimeType:   opts.MimeType,
		OnProgress: opts.OnProgress,
	})
	if err != nil {
		return nil, err
	}

	content := opts.Content
	if content == "" {
		content = uploaded.FileName
	}

	payload := map[string]interface{}{
		"content": content,
		"type":    "file",
		"metadata": map[string]interface{}{
			"uploadId": uploaded.UploadID,
			"fileUrl":  uploaded.CdnURL,
			"fileName": uploaded.FileName,
			"fileSize": uploaded.FileSize,
			"mimeType": uploaded.MimeType,
		},
	}
	if opts.ParentID != "" {
		payload["parentId"] = opts.ParentID
	}

	msgResult, err := f.im.do(ctx, "POST", "/api/im/messages/"+conversationID, payload, nil)
	if err != nil {
		return nil, err
	}
	if !msgResult.OK {
		msg := "failed to send file message"
		if msgResult.Error != nil {
			msg = msgResult.Error.Message
		}
		return nil, fmt.Errorf("%s", msg)
	}

	return &SendFileResult{Upload: uploaded, Message: msgResult.Data}, nil
}

// --------------------------------------------------------------------------
// Private upload helpers
// --------------------------------------------------------------------------

func (f *FilesClient) uploadSimple(
	ctx context.Context, data []byte, fileName string, fileSize int64, mimeType string,
	onProgress func(int64, int64),
) (*IMConfirmResult, error) {
	// Presign
	presignRes, err := f.Presign(ctx, &IMPresignOptions{FileName: fileName, FileSize: fileSize, MimeType: mimeType})
	if err != nil {
		return nil, err
	}
	if !presignRes.OK {
		msg := "presign failed"
		if presignRes.Error != nil {
			msg = presignRes.Error.Message
		}
		return nil, fmt.Errorf("%s", msg)
	}
	var presign IMPresignResult
	if err := presignRes.Decode(&presign); err != nil {
		return nil, fmt.Errorf("failed to decode presign: %w", err)
	}

	// Build multipart form
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	isS3 := strings.HasPrefix(presign.URL, "http")
	if isS3 {
		for k, v := range presign.Fields {
			_ = w.WriteField(k, v)
		}
	}

	part, err := w.CreateFormFile("file", fileName)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(data); err != nil {
		return nil, fmt.Errorf("failed to write file data: %w", err)
	}
	_ = w.Close()

	uploadURL := presign.URL
	if !isS3 {
		uploadURL = f.im.client.baseURL + presign.URL
	}

	req, err := http.NewRequestWithContext(ctx, "POST", uploadURL, &buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create upload request: %w", err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if !isS3 {
		f.setAuthHeaders(req)
	}

	resp, err := f.im.client.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("upload failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("upload failed (%d): %s", resp.StatusCode, string(body))
	}

	if onProgress != nil {
		onProgress(fileSize, fileSize)
	}

	// Confirm
	confirmRes, err := f.Confirm(ctx, presign.UploadID)
	if err != nil {
		return nil, err
	}
	if !confirmRes.OK {
		msg := "confirm failed"
		if confirmRes.Error != nil {
			msg = confirmRes.Error.Message
		}
		return nil, fmt.Errorf("%s", msg)
	}
	var confirmed IMConfirmResult
	if err := confirmRes.Decode(&confirmed); err != nil {
		return nil, fmt.Errorf("failed to decode confirm: %w", err)
	}
	return &confirmed, nil
}

func (f *FilesClient) uploadMultipart(
	ctx context.Context, data []byte, fileName string, fileSize int64, mimeType string,
	onProgress func(int64, int64),
) (*IMConfirmResult, error) {
	// Init
	initRes, err := f.InitMultipart(ctx, &IMPresignOptions{FileName: fileName, FileSize: fileSize, MimeType: mimeType})
	if err != nil {
		return nil, err
	}
	if !initRes.OK {
		msg := "multipart init failed"
		if initRes.Error != nil {
			msg = initRes.Error.Message
		}
		return nil, fmt.Errorf("%s", msg)
	}
	var init IMMultipartInitResult
	if err := initRes.Decode(&init); err != nil {
		return nil, fmt.Errorf("failed to decode multipart init: %w", err)
	}

	// Upload parts
	const chunkSize = 5 * 1024 * 1024
	var completed []IMCompletedPart
	var uploaded int64

	for _, p := range init.Parts {
		start := int64(p.PartNumber-1) * chunkSize
		end := start + chunkSize
		if end > fileSize {
			end = fileSize
		}
		chunk := data[start:end]

		isS3 := strings.HasPrefix(p.URL, "http")
		partURL := p.URL
		if !isS3 {
			partURL = f.im.client.baseURL + p.URL
		}

		req, err := http.NewRequestWithContext(ctx, "PUT", partURL, bytes.NewReader(chunk))
		if err != nil {
			return nil, fmt.Errorf("failed to create part request: %w", err)
		}
		req.Header.Set("Content-Type", mimeType)
		if !isS3 {
			f.setAuthHeaders(req)
		}

		resp, err := f.im.client.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("part %d upload failed: %w", p.PartNumber, err)
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("part %d upload failed (%d)", p.PartNumber, resp.StatusCode)
		}

		etag := resp.Header.Get("ETag")
		if etag == "" {
			etag = fmt.Sprintf(`"part-%d"`, p.PartNumber)
		}
		completed = append(completed, IMCompletedPart{PartNumber: p.PartNumber, ETag: etag})
		uploaded += int64(len(chunk))
		if onProgress != nil {
			onProgress(uploaded, fileSize)
		}
	}

	// Complete
	completeRes, err := f.CompleteMultipart(ctx, init.UploadID, completed)
	if err != nil {
		return nil, err
	}
	if !completeRes.OK {
		msg := "multipart complete failed"
		if completeRes.Error != nil {
			msg = completeRes.Error.Message
		}
		return nil, fmt.Errorf("%s", msg)
	}
	var confirmed IMConfirmResult
	if err := completeRes.Decode(&confirmed); err != nil {
		return nil, fmt.Errorf("failed to decode multipart complete: %w", err)
	}
	return &confirmed, nil
}

func (f *FilesClient) setAuthHeaders(req *http.Request) {
	if f.im.client.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+f.im.client.apiKey)
	}
	if f.im.client.imAgent != "" {
		req.Header.Set("X-IM-Agent", f.im.client.imAgent)
	}
}

// guessMimeType returns MIME type from file extension.
func guessMimeType(fileName string) string {
	ext := filepath.Ext(fileName)
	if ext == "" {
		return "application/octet-stream"
	}
	// Fallback for types not in Go's builtin registry
	fallback := map[string]string{
		".md": "text/markdown", ".yaml": "text/yaml", ".yml": "text/yaml",
		".webp": "image/webp", ".webm": "video/webm",
	}
	if m, ok := fallback[ext]; ok {
		return m
	}
	t := mime.TypeByExtension(ext)
	if t != "" {
		// Strip charset parameter (e.g. "text/plain; charset=utf-8" → "text/plain")
		if idx := strings.Index(t, ";"); idx > 0 {
			t = strings.TrimSpace(t[:idx])
		}
		return t
	}
	return "application/octet-stream"
}

// IMRealtimeClient handles real-time connection factory.
type IMRealtimeClient struct{ im *IMClient }

// WSUrl returns the WebSocket URL.
func (r *IMRealtimeClient) WSUrl(token string) string {
	base := strings.Replace(r.im.client.baseURL, "https://", "wss://", 1)
	base = strings.Replace(base, "http://", "ws://", 1)
	if token != "" {
		return base + "/ws?token=" + token
	}
	return base + "/ws"
}

// SSEUrl returns the SSE URL.
func (r *IMRealtimeClient) SSEUrl(token string) string {
	if token != "" {
		return r.im.client.baseURL + "/sse?token=" + token
	}
	return r.im.client.baseURL + "/sse"
}

// ConnectWS creates a WebSocket real-time client. Call Connect() to establish connection.
func (r *IMRealtimeClient) ConnectWS(config *RealtimeConfig) *RealtimeWSClient {
	cfg := *config
	cfg.defaults()
	return &RealtimeWSClient{
		baseURL:      r.im.client.baseURL,
		config:       &cfg,
		state:        StateDisconnected,
		dispatcher:   newEventDispatcher(),
		recon:        newReconnector(&cfg),
		pendingPings: make(map[string]chan PongPayload),
	}
}

// ConnectSSE creates an SSE real-time client. Call Connect() to establish connection.
func (r *IMRealtimeClient) ConnectSSE(config *RealtimeConfig) *RealtimeSSEClient {
	cfg := *config
	cfg.defaults()
	return &RealtimeSSEClient{
		baseURL:    r.im.client.baseURL,
		config:     &cfg,
		state:      StateDisconnected,
		dispatcher: newEventDispatcher(),
		recon:      newReconnector(&cfg),
	}
}
