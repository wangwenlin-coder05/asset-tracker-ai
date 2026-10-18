package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.common.Ids;
import com.wangwenlin.stock.service.UploadService;
import com.wangwenlin.stock.tenant.UserContext;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 无限画布图片上传。对齐 Node 端 server.js 13296-13300：
 * 文件名固定 board-&lt;时间戳&gt;-&lt;6位随机&gt; + 原扩展名，multer boardStorage 限 20MB。
 */
@RestController
public class BoardController {

    /** multer boardStorage 的 limits.fileSize = 20MB。 */
    private static final long MAX_UPLOAD_BYTES = 20L * 1024 * 1024;

    private final UploadService uploadService;

    public BoardController(UploadService uploadService) {
        this.uploadService = uploadService;
    }

    @PostMapping("/api/board/upload-image")
    public Map<String, Object> uploadImage(@RequestParam(value = "image", required = false) MultipartFile image) {
        if (image == null) {
            throw new ApiException(400, "请选择图片文件");
        }
        String contentType = image.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            // 对齐 Node：boardUpload 的错误直接落到 Express 全局兜底 → 500「请求处理失败」
            throw new ApiException(500, "请求处理失败");
        }
        String original = image.getOriginalFilename() == null ? "" : image.getOriginalFilename();
        String ext = UploadService.extname(original);
        if (ext.isEmpty()) {
            ext = ".png";
        }
        String filename = "board-" + System.currentTimeMillis() + "-" + Ids.base36Six() + ext;
        String imagePath = uploadService.store(UserContext.requireUserId(), "board", image, filename, MAX_UPLOAD_BYTES);
        Map<String, Object> result = new LinkedHashMap<>(1);
        result.put("imagePath", imagePath);
        return result;
    }
}
