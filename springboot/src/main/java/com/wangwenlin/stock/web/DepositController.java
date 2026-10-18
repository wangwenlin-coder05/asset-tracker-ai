package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.service.DepositService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 存款 / 账户路由（12 个）—— 路径与 Node 端 server.js 一一对应，故不设类级前缀。
 */
@RestController
public class DepositController {

    private final DepositService depositService;

    public DepositController(DepositService depositService) {
        this.depositService = depositService;
    }

    @GetMapping("/api/deposits")
    public List<Map<String, Object>> list() {
        return depositService.list();
    }

    @PostMapping("/api/deposits")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
        return depositService.create(body);
    }

    @PutMapping("/api/deposits/{id}")
    public Map<String, Object> update(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return depositService.update(id, body);
    }

    @DeleteMapping("/api/deposits/{id}")
    public Map<String, Object> delete(@PathVariable("id") String id) {
        return depositService.delete(id);
    }

    @PutMapping("/api/deposits/{id}/move")
    public Map<String, Object> move(@PathVariable("id") String id,
                                    @RequestBody(required = false) Map<String, Object> body) {
        return depositService.move(id, body);
    }

    @PostMapping("/api/deposits/upload-icon")
    public Map<String, Object> uploadIcon(@RequestParam(value = "icon", required = false) MultipartFile icon,
                                          @RequestParam(value = "name", required = false) String name) {
        if (icon == null) {
            throw new ApiException(400, "未上传文件");
        }
        String contentType = icon.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new ApiException(400, "仅支持图片文件");
        }
        return depositService.uploadIcon(icon, name);
    }

    @GetMapping("/api/deposits/icons")
    public List<Map<String, Object>> icons() {
        return depositService.listIcons();
    }

    @PostMapping("/api/deposits/generate-icon")
    public Map<String, Object> generateIcon(@RequestBody(required = false) Map<String, Object> body) {
        return depositService.generateIcon(body);
    }

    @PostMapping("/api/deposits/save-icon")
    public Map<String, Object> saveIcon(@RequestBody(required = false) Map<String, Object> body) {
        return depositService.saveIcon(body);
    }

    @GetMapping("/api/deposits/{id}/transactions")
    public List<Map<String, Object>> transactions(@PathVariable("id") String id) {
        return depositService.listTransactions(id);
    }

    @PostMapping("/api/deposits/{id}/transactions")
    public Map<String, Object> insertTransaction(@PathVariable("id") String id,
                                                 @RequestBody(required = false) Map<String, Object> body) {
        return depositService.insertTransactionById(id, body);
    }

    @PostMapping("/api/deposits/{id}/repay")
    public Map<String, Object> repay(@PathVariable("id") String id,
                                     @RequestBody(required = false) Map<String, Object> body) {
        return depositService.repay(id, body);
    }
}
