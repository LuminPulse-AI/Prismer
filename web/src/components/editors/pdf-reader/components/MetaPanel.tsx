import React, { useState, useEffect } from 'react';
import { pdfjs } from 'react-pdf';
import { Calendar, User, FileText, Tag, Code, File, Info, Clock, Hash, Layers, Copy, Check } from 'lucide-react';

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
  pdfVersion?: string;
  numPages?: number;
  fileSize?: string;
  fileName?: string;
  isLinearized?: boolean;
  isEncrypted?: boolean;
  permissions?: {
    printing?: boolean;
    modifying?: boolean;
    copying?: boolean;
    annotating?: boolean;
  };
}

// PDF.js metadata info type
interface PDFInfo {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
  Creator?: string;
  Producer?: string;
  CreationDate?: string;
  ModDate?: string;
}

interface MetaPanelProps {
  file: string;
  numPages: number;
}

export const MetaPanel: React.FC<MetaPanelProps> = ({ file, numPages }) => {
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const loadMetadata = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const pdf = await pdfjs.getDocument(file).promise;
        const metadata = await pdf.getMetadata();
        
        // Get file information
        const fileName = typeof file === 'string' ? file.split('/').pop() || 'Unknown' : 'Uploaded File';
        
        // Format dates
        const formatDate = (dateStr?: string) => {
          if (!dateStr) return undefined;
          try {
            // PDF date format is typically D:YYYYMMDDHHmmSSOHH'mm'
            if (dateStr.startsWith('D:')) {
              const year = dateStr.substring(2, 6);
              const month = dateStr.substring(6, 8);
              const day = dateStr.substring(8, 10);
              const hour = dateStr.substring(10, 12);
              const minute = dateStr.substring(12, 14);
              const second = dateStr.substring(14, 16);
              
              const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
              return date.toLocaleString();
            }
            return new Date(dateStr).toLocaleString();
          } catch {
            return dateStr;
          }
        };

        // Get file size (if possible)
        const getFileSize = () => {
          if (typeof file === 'string') {
            return 'Unknown';
          }
          // 对于File对象，可以获取size
          return 'Unknown';
        };

        // Cast the info object to our expected type
        const info = metadata.info as PDFInfo | undefined;
        
        const pdfMetadata: PDFMetadata = {
          title: info?.Title || undefined,
          author: info?.Author || undefined,
          subject: info?.Subject || undefined,
          keywords: info?.Keywords || undefined,
          creator: info?.Creator || undefined,
          producer: info?.Producer || undefined,
          creationDate: formatDate(info?.CreationDate),
          modDate: formatDate(info?.ModDate),
          pdfVersion: (pdf as unknown as { version?: string }).version || undefined,
          numPages,
          fileName,
          fileSize: getFileSize(),
          isLinearized: (pdf as unknown as { linearized?: boolean }).linearized || false,
          isEncrypted: (pdf as unknown as { encrypted?: boolean }).encrypted || false,
          permissions: {
            printing: true, // Default values; actual values should be based on PDF permissions
            modifying: true,
            copying: true,
            annotating: true,
          }
        };

        setMetadata(pdfMetadata);
      } catch (err) {
        console.error('Failed to load PDF metadata:', err);
        setError('Failed to load PDF metadata');
      } finally {
        setLoading(false);
      }
    };

    if (file) {
      loadMetadata();
    }
  }, [file, numPages]);

  // Copy text to clipboard
  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000); // Reset state after 2 seconds
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500">Loading metadata...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Info className="w-6 h-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <FileText className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No metadata available</p>
        </div>
      </div>
    );
  }

  const MetaItem: React.FC<{ 
    icon: React.ReactNode; 
    label: string; 
    value?: string; 
    multiline?: boolean 
  }> = ({ icon, label, value, multiline = false }) => {
    if (!value || value === 'Unknown') return null;
    
    const fieldKey = `${label}-${value}`;
    const isCopied = copiedField === fieldKey;
    
    return (
      <div className="group flex gap-3 p-3 rounded-lg hover:bg-gray-100/50 transition-colors duration-200">
        <div className="flex-shrink-0 w-5 h-5 text-gray-500 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 mb-1">{label}</p>
          <p className={`text-sm text-gray-700 ${multiline ? 'whitespace-pre-wrap' : 'truncate'}`}>
            {value}
          </p>
        </div>
        <button
          onClick={() => copyToClipboard(value, fieldKey)}
          className="flex-shrink-0 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-200 rounded p-1 mt-0.5"
          title={isCopied ? 'Copied!' : 'Copy to clipboard'}
        >
          {isCopied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-1">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Document Information
        </h3>
        <button
          onClick={() => {
            const allMetadata = [
              metadata.title && `Title: ${metadata.title}`,
              metadata.author && `Author: ${metadata.author}`,
              metadata.subject && `Subject: ${metadata.subject}`,
              metadata.keywords && `Keywords: ${metadata.keywords}`,
              metadata.creator && `Creator: ${metadata.creator}`,
              metadata.producer && `Producer: ${metadata.producer}`,
              metadata.creationDate && `Creation Date: ${metadata.creationDate}`,
              metadata.modDate && `Modified Date: ${metadata.modDate}`,
              metadata.fileName && `File Name: ${metadata.fileName}`,
              metadata.pdfVersion && `PDF Version: ${metadata.pdfVersion}`,
              metadata.numPages && `Pages: ${metadata.numPages}`,
            ].filter(Boolean).join('\n');
            copyToClipboard(allMetadata, 'all-metadata');
          }}
          className="text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-200 flex items-center gap-1"
          title="Copy all metadata"
        >
          {copiedField === 'all-metadata' ? (
            <>
              <Check className="w-3 h-3 text-green-600" />
              <span className="text-green-600">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy All</span>
            </>
          )}
        </button>
      </div>

      <div className="space-y-1">
        {/* Basic information */}
        <MetaItem
          icon={<FileText className="w-4 h-4" />}
          label="Title"
          value={metadata.title}
        />

        <MetaItem
          icon={<User className="w-4 h-4" />}
          label="Author"
          value={metadata.author}
        />

        <MetaItem
          icon={<FileText className="w-4 h-4" />}
          label="Subject"
          value={metadata.subject}
          multiline
        />

        <MetaItem
          icon={<Tag className="w-4 h-4" />}
          label="Keywords"
          value={metadata.keywords}
          multiline
        />

        {/* Creation information */}
        <MetaItem
          icon={<Code className="w-4 h-4" />}
          label="Creator"
          value={metadata.creator}
        />

        <MetaItem
          icon={<Code className="w-4 h-4" />}
          label="Producer"
          value={metadata.producer}
        />

        {/* Date information */}
        <MetaItem
          icon={<Calendar className="w-4 h-4" />}
          label="Creation Date"
          value={metadata.creationDate}
        />

        <MetaItem
          icon={<Clock className="w-4 h-4" />}
          label="Modified Date"
          value={metadata.modDate}
        />

        {/* File information */}
        <MetaItem
          icon={<File className="w-4 h-4" />}
          label="File Name"
          value={metadata.fileName}
        />

        <MetaItem
          icon={<Hash className="w-4 h-4" />}
          label="PDF Version"
          value={metadata.pdfVersion}
        />

        <MetaItem
          icon={<Layers className="w-4 h-4" />}
          label="Pages"
          value={metadata.numPages?.toString()}
        />

        {/* Document properties */}
        {metadata.isLinearized && (
          <div className="flex gap-3 p-3 rounded-lg hover:bg-gray-100/50 transition-colors duration-200">
            <div className="flex-shrink-0 w-5 h-5 text-green-500 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800 mb-1">Optimized</p>
              <p className="text-sm text-gray-700">Linearized for fast web view</p>
            </div>
          </div>
        )}

        {metadata.isEncrypted && (
          <div className="flex gap-3 p-3 rounded-lg hover:bg-gray-100/50 transition-colors duration-200">
            <div className="flex-shrink-0 w-5 h-5 text-yellow-500 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800 mb-1">Security</p>
              <p className="text-sm text-gray-700">Document is encrypted</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer description */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Metadata extracted from PDF document properties
        </p>
      </div>
    </div>
  );
}; 